import path from "path";
import { DebugConfiguration } from "vscode";
import {
  DebugSession,
  InitializedEvent,
  StoppedEvent,
  Event,
  ContinuedEvent,
  OutputEvent,
  Thread,
  TerminatedEvent,
  ThreadEvent,
  Breakpoint,
  Source,
  StackFrame,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import WebSocket from "ws";
import { NullablePosition, SourceMapConsumer } from "source-map";
import { formatMessage } from "./logFormatting";
import { Logger } from "../Logger";
import {
  inferDAPScopePresentationHintFromCDPType,
  inferDAPVariableValueForCDPRemoteObject,
  CDPDebuggerScope,
  CDPRemoteObject,
} from "./cdp";
import { VariableStore } from "./variableStore";

type ResolveType<T = unknown> = (result: T) => void;
type RejectType = (error: unknown) => void;

interface PromiseHandlers<T = unknown> {
  resolve: ResolveType<T>;
  reject: RejectType;
}

function compareIgnoringHost(url1: string, url2: string) {
  try {
    const firstURL = new URL(url1);
    const secondURL = new URL(url2);
    firstURL.hostname = secondURL.hostname = "localhost";
    firstURL.port = secondURL.port = "8080";
    return firstURL.href === secondURL.href;
  } catch (e) {
    return false;
  }
}

function typeToCategory(type: string) {
  switch (type) {
    case "warning":
    case "error":
      return "stderr";
    default:
      return "stdout";
  }
}

class MyBreakpoint extends Breakpoint {
  public readonly line: number;
  public readonly column: number | undefined;
  private _id: number | undefined;
  constructor(verified: boolean, line: number, column?: number, source?: Source) {
    super(verified, line, column, source);
    this.column = column;
    this.line = line;
  }
  setId(id: number): void {
    super.setId(id);
    this._id = id;
  }
  getId(): number | undefined {
    // we cannot use `get id` here, because Breakpoint actually has a private field
    // called id, and it'd collide with this getter making it impossible to set it
    return this._id;
  }
}

export class DebugAdapter extends DebugSession {
  private variableStore: VariableStore = new VariableStore();
  private connection: WebSocket;
  private absoluteProjectPath: string;
  private projectPathAlias?: string;
  private threads: Array<Thread> = [];
  private sourceMaps: Array<[string, string, SourceMapConsumer]> = [];

  private linesStartAt1 = true;
  private columnsStartAt1 = true;

  private pausedStackFrames: StackFrame[] = [];
  private pausedScopeChains: CDPDebuggerScope[][] = [];

  constructor(configuration: DebugConfiguration) {
    super();
    this.absoluteProjectPath = configuration.absoluteProjectPath;
    this.projectPathAlias = configuration.projectPathAlias;
    this.connection = new WebSocket(configuration.websocketAddress);

    this.connection.on("open", () => {
      // the below catch handler is used to ignore errors coming from non critical CDP messages we
      // expect in some setups to fail
      const ignoreError = () => {};
      this.sendCDPMessage("FuseboxClient.setClientMetadata", {}).catch(ignoreError);
      this.sendCDPMessage("Runtime.enable", {});
      this.sendCDPMessage("Debugger.enable", { maxScriptsCacheSize: 100000000 });
      this.sendCDPMessage("Debugger.setPauseOnExceptions", { state: "none" });
      this.sendCDPMessage("Debugger.setAsyncCallStackDepth", { maxDepth: 32 }).catch(ignoreError);
      this.sendCDPMessage("Debugger.setBlackboxPatterns", { patterns: [] }).catch(ignoreError);
      this.sendCDPMessage("Runtime.runIfWaitingForDebugger", {});
      this.sendCDPMessage("Runtime.evaluate", {
        expression: "__RNIDE_onDebuggerConnected()",
      });
    });

    this.connection.on("close", () => {
      this.sendEvent(new TerminatedEvent());
    });

    this.connection.on("message", async (data) => {
      const message = JSON.parse(data.toString());
      if (message.result || message.error) {
        const messagePromise = this.cdpMessagePromises.get(message.id);
        this.cdpMessagePromises.delete(message.id);
        if (message.result && messagePromise?.resolve) {
          messagePromise.resolve(message.result);
        } else if (message.error && messagePromise?.reject) {
          Logger.warn("CDP message error received", message.error);
          // create an error object such that we can capture stack trace and assign
          // all object error properties as provided by CDP
          const error = new Error();
          Object.assign(error, message.error);
          messagePromise.reject(error);
        }
        return;
      }
      switch (message.method) {
        case "Runtime.executionContextCreated":
          const context = message.params.context;
          const threadId = context.id;
          const threadName = context.name;
          this.sendEvent(new ThreadEvent("started", threadId));
          this.threads.push(new Thread(threadId, threadName));
          break;
        case "Debugger.scriptParsed":
          const sourceMapURL = message.params.sourceMapURL;

          if (sourceMapURL?.startsWith("data:")) {
            const base64Data = sourceMapURL.split(",")[1];
            const decodedData = Buffer.from(base64Data, "base64").toString("utf-8");
            const sourceMap = JSON.parse(decodedData);
            const consumer = await new SourceMapConsumer(sourceMap);
            this.sourceMaps.push([message.params.url, message.params.scriptId, consumer]);
            this.updateBreakpointsInSource(message.params.url, consumer);
          }

          this.sendEvent(new InitializedEvent());
          break;
        case "Debugger.paused":
          this.handleDebuggerPaused(message);
          break;
        case "Debugger.resumed":
          this.sendEvent(new ContinuedEvent(this.threads[0].id));
          break;
        case "Runtime.executionContextsCleared":
          this.variableStore.clearReplVariables();
          this.variableStore.clearCDPVariables();
          this.sendEvent(new OutputEvent("\x1b[2J", "console"));
          break;
        case "Runtime.consoleAPICalled":
          this.handleConsoleAPICall(message);
          break;
        default:
          break;
      }
    });
  }

  private async handleConsoleAPICall(message: any) {
    // We wrap console calls and add stack information as last three arguments, however
    // some logs may baypass that, especially when printed in initialization phase, so we
    // need to detect whether the wrapper has added the stack info or not
    // We check if there are more than 3 arguments, and if the last one is a number
    const argsLen = message.params.args.length;
    let output: OutputEvent;
    if (argsLen > 3 && message.params.args[argsLen - 1].type === "number") {
      // Since console.log stack is extracted from Error, unlike other messages sent over CDP
      // the line and column numbers are 1-based
      const [scriptURL, generatedLineNumber1Based, generatedColumn1Based] = message.params.args
        .slice(-3)
        .map((v: any) => v.value);

      const { lineNumber1Based, columnNumber0Based, sourceURL } = this.findOriginalPosition(
        scriptURL,
        generatedLineNumber1Based,
        generatedColumn1Based - 1
      );

      const variablesRefDapID = this.createVariableForOutputEvent(message.params.args.slice(0, -3));

      output = new OutputEvent(
        (await formatMessage(message.params.args.slice(0, -3))) + "\n",
        typeToCategory(message.params.type)
      );
      output.body = {
        ...output.body,
        //@ts-ignore source, line, column and group are valid fields
        source: new Source(sourceURL, sourceURL),
        line: this.linesStartAt1 ? lineNumber1Based : lineNumber1Based - 1,
        column: this.columnsStartAt1 ? columnNumber0Based + 1 : columnNumber0Based,
        variablesReference: variablesRefDapID,
      };
    } else {
      const variablesRefDapID = this.createVariableForOutputEvent(message.params.args);

      output = new OutputEvent(
        (await formatMessage(message.params.args)) + "\n",
        typeToCategory(message.params.type)
      );
      output.body = {
        ...output.body,
        //@ts-ignore source, line, column and group are valid fields
        variablesReference: variablesRefDapID,
      };
    }
    this.sendEvent(output);
    this.sendEvent(
      new Event("RNIDE_consoleLog", { category: typeToCategory(message.params.type) })
    );
  }

  private createVariableForOutputEvent(args: CDPRemoteObject[]) {
    // we create empty object that is needed for DAP OutputEvent to display
    // collapsed args properly, the object references the array of args array
    const argsObjectDapID = this.variableStore.pushReplVariable(
      args.map((arg: CDPRemoteObject, index: number) => {
        if (arg.type === "object") {
          arg.objectId = this.variableStore.adaptCDPObjectId(arg.objectId).toString();
        }
        return { name: `arg${index}`, value: arg };
      })
    );

    return this.variableStore.pushReplVariable([
      {
        name: "",
        value: {
          type: "object",
          objectId: argsObjectDapID.toString(),
          className: "Object",
          description: "object",
        },
      },
    ]);
  }

  private findOriginalPosition(
    scriptIdOrURL: string,
    lineNumber1Based: number,
    columnNumber0Based: number
  ) {
    let scriptURL = "__script__";
    let sourceURL = "__source__";
    let sourceLine1Based = lineNumber1Based;
    let sourceColumn0Based = columnNumber0Based;

    this.sourceMaps.forEach(([url, id, consumer]) => {
      // when we identify script by its URL we need to deal with a situation when the URL is sent with a different
      // hostname and port than the one we have registered in the source maps. The reason for that is that the request
      // that populates the source map (scriptParsed) is sent by metro, while the requests from breakpoints or logs
      // are sent directly from the device. In different setups, specifically on Android emulator, the device uses different URLs
      // than localhost because it has a virtual network interface. Hence we need to unify the URL:
      if (id === scriptIdOrURL || compareIgnoringHost(url, scriptIdOrURL)) {
        scriptURL = url;
        const pos = consumer.originalPositionFor({
          line: lineNumber1Based,
          column: columnNumber0Based,
        });
        if (pos.source !== null) {
          sourceURL = pos.source;
        }
        if (pos.line !== null) {
          sourceLine1Based = pos.line;
        }
        if (pos.column !== null) {
          sourceColumn0Based = pos.column;
        }
      }
    });
    if (this.projectPathAlias) {
      // URL may contain ".." fragments, so we want to resolve it to a proper absolute file path
      sourceURL = path.resolve(sourceURL.replace(this.projectPathAlias, this.absoluteProjectPath));
    }

    return {
      sourceURL,
      lineNumber1Based: sourceLine1Based,
      columnNumber0Based: sourceColumn0Based,
      scriptURL,
    };
  }

  private async handleDebuggerPaused(message: any) {
    // We reset the paused* variables to lifecycle of objects references in DAP. https://microsoft.github.io/debug-adapter-protocol//overview.html#lifetime-of-objects-references
    this.pausedStackFrames = [];
    this.pausedScopeChains = [];

    if (
      message.params.reason === "other" &&
      message.params.callFrames[0].functionName === "__RNIDE_breakOnError"
    ) {
      // this is a workaround for an issue with hermes which does not provide a full stack trace
      // when it pauses due to the uncaught exception. Instead, we trigger debugger pause from exception
      // reporting handler, and access the actual error's stack trace from local variable
      const localScopeCDPObjectId = message.params.callFrames[0].scopeChain?.find(
        (scope: any) => scope.type === "local"
      )?.object?.objectId;
      const localScopeObjectId = this.variableStore.adaptCDPObjectId(localScopeCDPObjectId);
      const localScopeVariables = await this.variableStore.get(
        localScopeObjectId,
        (params: object) => {
          return this.sendCDPMessage("Runtime.getProperties", params);
        }
      );
      const errorMessage = localScopeVariables.find((v) => v.name === "message")?.value;
      const isFatal = localScopeVariables.find((v) => v.name === "isFatal")?.value;
      const stackObjectId = localScopeVariables.find((v) => v.name === "stack")?.variablesReference;

      const stackObjectProperties = await this.variableStore.get(
        stackObjectId!,
        (params: object) => {
          return this.sendCDPMessage("Runtime.getProperties", params);
        }
      );

      const stackFrames: Array<StackFrame> = [];
      // Unfortunately we can't get proper scope chanins here, because the debugger doesn't really stop at the frame where exception is thrown
      await Promise.all(
        stackObjectProperties.map(async (stackObjEntry) => {
          // we process entry with numerical names
          if (stackObjEntry.name.match(/^\d+$/)) {
            const index = parseInt(stackObjEntry.name, 10);
            const stackObjProperties = await this.variableStore.get(
              stackObjEntry.variablesReference,
              (params: object) => {
                return this.sendCDPMessage("Runtime.getProperties", params);
              }
            );
            const methodName = stackObjProperties.find((v) => v.name === "methodName")?.value || "";
            const genUrl = stackObjProperties.find((v) => v.name === "file")?.value || "";
            const genLine1Based = parseInt(
              stackObjProperties.find((v) => v.name === "lineNumber")?.value || "0"
            );
            const genColumn1Based = parseInt(
              stackObjProperties.find((v) => v.name === "column")?.value || "0"
            );
            const { sourceURL, lineNumber1Based, columnNumber0Based, scriptURL } =
              this.findOriginalPosition(genUrl, genLine1Based, genColumn1Based - 1);
            stackFrames[index] = new StackFrame(
              index,
              methodName,
              sourceURL ? new Source(scriptURL, sourceURL) : undefined,
              this.linesStartAt1 ? lineNumber1Based : lineNumber1Based - 1,
              this.columnsStartAt1 ? columnNumber0Based + 1 : columnNumber0Based
            );
          }
        })
      );
      this.pausedStackFrames = stackFrames;
      this.sendEvent(new StoppedEvent("exception", this.threads[0].id, errorMessage));
      this.sendEvent(new Event("RNIDE_paused", { reason: "exception", isFatal: isFatal }));
    } else {
      this.pausedStackFrames = message.params.callFrames.map((cdpFrame: any, index: number) => {
        const cdpLocation = cdpFrame.location;
        const { sourceURL, lineNumber1Based, columnNumber0Based, scriptURL } =
          this.findOriginalPosition(
            cdpLocation.scriptId,
            cdpLocation.lineNumber + 1, // cdp line and column numbers are 0-based
            cdpLocation.columnNumber
          );
        return new StackFrame(
          index,
          cdpFrame.functionName,
          sourceURL ? new Source(scriptURL, sourceURL) : undefined,
          this.linesStartAt1 ? lineNumber1Based : lineNumber1Based - 1,
          this.columnsStartAt1 ? columnNumber0Based + 1 : columnNumber0Based
        );
      });
      this.pausedScopeChains = message.params.callFrames.map(
        (cdpFrame: any) => cdpFrame.scopeChain
      );
      this.sendEvent(new StoppedEvent("breakpoint", this.threads[0].id, "Yollo"));
      this.sendEvent(new Event("RNIDE_paused"));
    }
  }

  private cdpMessageId = 0;
  private cdpMessagePromises: Map<number, PromiseHandlers> = new Map();

  public async sendCDPMessage(method: string, params: object) {
    const message = {
      id: ++this.cdpMessageId,
      method: method,
      params: params,
    };
    this.connection.send(JSON.stringify(message));
    return new Promise<any>((resolve, reject) => {
      this.cdpMessagePromises.set(message.id, { resolve, reject });
    });
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    this.linesStartAt1 = args.linesStartAt1 || true;
    this.columnsStartAt1 = args.columnsStartAt1 || true;
    response.body = response.body || {};
    // response.body.supportsConditionalBreakpoints = true;
    // response.body.supportsHitConditionalBreakpoints = true;
    // response.body.supportsFunctionBreakpoints = true;
    this.sendResponse(response);
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments
  ): void {
    // Implement launching the debugger
    this.sendResponse(response);
  }

  private toGeneratedPosition(file: string, lineNumber1Based: number, columnNumber0Based: number) {
    let genFileName = file;
    if (this.projectPathAlias) {
      // we first convert the file path to be relative to project:
      const fileRelative = path.relative(this.absoluteProjectPath, file);
      // no we append the project path alias that represents the root of the project
      genFileName = path.join(this.projectPathAlias, fileRelative);
    }
    let position: NullablePosition = { line: null, column: null, lastColumn: null };
    let originalSourceURL: string = "";
    this.sourceMaps.forEach(([sourceURL, scriptId, consumer]) => {
      const sources = [];
      consumer.eachMapping((mapping) => {
        sources.push(mapping.source);
      });
      const pos = consumer.generatedPositionFor({
        source: genFileName,
        line: lineNumber1Based,
        column: columnNumber0Based,
        bias: SourceMapConsumer.LEAST_UPPER_BOUND,
      });
      if (pos.line !== null) {
        originalSourceURL = sourceURL;
        position = pos;
      }
    });
    if (position.line === null) {
      return null;
    }
    return {
      source: originalSourceURL,
      lineNumber1Based: position.line,
      columnNumber0Based: position.column,
    };
  }

  private async setCDPBreakpoint(file: string, line: number, column: number) {
    const generatedPos = this.toGeneratedPosition(file, line, column);
    if (generatedPos) {
      const result = await this.sendCDPMessage("Debugger.setBreakpointByUrl", {
        // in CDP line and column numbers are 0-based
        lineNumber: generatedPos.lineNumber1Based - 1,
        url: generatedPos.source,
        columnNumber: generatedPos.columnNumber0Based,
        condition: "",
      });
      if (result && result.breakpointId !== undefined) {
        return result.breakpointId as number;
      }
    }
    return null;
  }

  private breakpoints = new Map<string, Array<MyBreakpoint>>();

  private updateBreakpointsInSource(sourceURL: string, consumer: SourceMapConsumer) {
    // this method gets called after we are informed that a new script has been parsed. If we
    // had breakpoints set in that script, we need to let the runtime know about it

    const pathsToUpdate = new Set<string>();
    consumer.eachMapping((mapping) => {
      if (this.breakpoints.has(mapping.source)) {
        pathsToUpdate.add(mapping.source);
      }
    });

    pathsToUpdate.forEach((pathToUpdate) => {
      const breakpoints = this.breakpoints.get(pathToUpdate) || [];
      breakpoints.forEach(async (bp) => {
        if (bp.verified) {
          this.sendCDPMessage("Debugger.removeBreakpoint", { breakpointId: bp.getId() });
        }
        const newId = await this.setCDPBreakpoint(
          pathToUpdate,
          this.linesStartAt1 ? bp.line : bp.line + 1,
          this.columnsStartAt1 ? (bp.column || 1) - 1 : bp.column || 0
        );
        if (newId !== null) {
          bp.setId(newId);
          bp.verified = true;
        } else {
          bp.verified = false;
        }
      });
    });
  }

  protected async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    const sourcePath = args.source.path as string;

    const previousBreakpoints = this.breakpoints.get(sourcePath) || [];

    const breakpoints = (args.breakpoints || []).map((bp) => {
      const previousBp = previousBreakpoints.find(
        (prevBp) => prevBp.line === bp.line && prevBp.column === bp.column
      );
      if (previousBp) {
        return previousBp;
      } else {
        return new MyBreakpoint(false, bp.line, bp.column);
      }
    });

    // remove old breakpoints
    previousBreakpoints.forEach((bp) => {
      if (
        bp.verified &&
        !breakpoints.find((newBp) => newBp.line === bp.line && newBp.column === bp.column)
      ) {
        this.sendCDPMessage("Debugger.removeBreakpoint", { breakpointId: bp.getId() });
      }
    });

    this.breakpoints.set(sourcePath, breakpoints);

    const resolvedBreakpoints = await Promise.all<Breakpoint>(
      breakpoints.map(async (bp) => {
        if (bp.verified) {
          return bp;
        } else {
          const breakpointId = await this.setCDPBreakpoint(sourcePath, bp.line, bp.column || 0);
          if (breakpointId !== null) {
            bp.verified = true;
            bp.setId(breakpointId);
            return bp;
          } else {
            return bp;
          }
        }
      })
    );

    // send back the actual breakpoint positions
    response.body = {
      breakpoints: resolvedBreakpoints,
    };
    this.sendResponse(response);
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: this.threads,
    };
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): void {
    response.body = response.body || {};
    response.body.stackFrames = this.pausedStackFrames;
    this.sendResponse(response);
  }

  protected async scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): Promise<void> {
    response.body = response.body || {};

    response.body.scopes =
      this.pausedScopeChains[args.frameId]?.map((scope) => ({
        name: scope.type === "closure" ? "CLOSURE" : scope.name || scope.type.toUpperCase(), // for closure type, names are just numbers, so they don't look good, instead we just use name "CLOSURE"
        variablesReference: this.variableStore.adaptCDPObjectId(scope.object.objectId),
        presentationHint: inferDAPScopePresentationHintFromCDPType(scope.type),
        expensive: scope.type !== "local", // we only mark local scope as non-expensive as it is the one typically people want to look at and shouldn't have too many objects
      })) || [];
    this.sendResponse(response);
  }

  protected async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): Promise<void> {
    response.body = response.body || {};
    response.body.variables = await this.variableStore.get(
      args.variablesReference,
      (params: object) => {
        return this.sendCDPMessage("Runtime.getProperties", params);
      }
    );
    this.sendResponse(response);
  }

  protected async continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ): Promise<void> {
    await this.sendCDPMessage("Debugger.resume", { terminateOnResume: false });
    this.sendResponse(response);
    this.sendEvent(new Event("RNIDE_continued"));
  }

  protected async nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments
  ): Promise<void> {
    await this.sendCDPMessage("Debugger.stepOver", {});
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): void {
    this.connection.close();
    this.sendResponse(response);
  }

  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): Promise<void> {
    const cdpResponse = await this.sendCDPMessage("Runtime.evaluate", {
      expression: args.expression,
    });
    const remoteObject = cdpResponse.result;
    const stringValue = inferDAPVariableValueForCDPRemoteObject(remoteObject);

    response.body = response.body || {};
    response.body.result = stringValue;
    response.body.variablesReference = 0;
    if (remoteObject.type === "object") {
      const dapID = this.variableStore.adaptCDPObjectId(remoteObject.objectId);
      response.body.type = "object";
      response.body.variablesReference = dapID;
    }
    this.sendResponse(response);
  }

  protected customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: any,
    request?: DebugProtocol.Request | undefined
  ): void {
    Logger.debug(`Custom req ${command} ${args}`);
  }
}
