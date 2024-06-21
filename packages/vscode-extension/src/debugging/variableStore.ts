import { Variable } from "@vscode/debugadapter";
import { CDPPropertyDescriptor, inferDAPVariableValueForCDPRemoteObject } from "./cdp";
import Cdp from "./api";

const getVariableId = (() => {
  let last = 1;
  const max = 0x7fffffff - 1;
  return () => (last++ % max) + 1;
})();

export class VariableStore {
  private replVariables: Map<number, CDPPropertyDescriptor[]> = new Map();

  private CDPtoDAPObjectIdMap: Map<string, number> = new Map();
  private DAPtoCDPObjectIdMap: Map<number, string> = new Map();

  /**
   * If exist it returns a local variables if not it tries to fetch them from cdp.
   * @param id VariableId.
   * @param fetchProperties a method for fetching properties from cdp.
   */
  public async get(
    id: number,
    fetchProperties: (params: Cdp.Runtime.GetPropertiesParams) => Promise<any>
  ): Promise<Variable[]> {
    let properties: CDPPropertyDescriptor[];
    let isCDPObject: boolean;
    if (this.DAPtoCDPObjectIdMap.has(id)) {
      const cdpObjectId = this.convertDAPObjectIdToCDP(id);
      properties = (
        await fetchProperties({
          // @ts-ignore TODO(TS): check if ID can be undefined
          objectId: cdpObjectId,
          ownProperties: true,
        })
      ).result as CDPPropertyDescriptor[];
      isCDPObject = true;
    } else {
      properties = this.replVariables.get(id) as CDPPropertyDescriptor[];
      isCDPObject = false;
    }

    const variables: Variable[] = properties
      .map((prop) => {
        if (prop.value === undefined) {
          return { name: prop.name, value: "undefined", variablesReference: 0 };
        }
        const value = inferDAPVariableValueForCDPRemoteObject(prop.value);
        if (prop.value.type === "object") {
          let variablesReference: number;
          if (isCDPObject) {
            variablesReference = this.adaptCDPObjectId(prop.value.objectId);
          } else {
            variablesReference = Number(prop.value.objectId);
          }
          return {
            name: prop.name,
            value,
            type: "object",
            variablesReference,
          };
        }
        return {
          name: prop.name,
          value,
          type: prop.value?.type,
          variablesReference: 0,
        };
      })
      .filter((prop) => {
        return prop.name !== "__proto__";
      });

    return variables;
  }

  /**
   * Returns the id of stored property.
   */
  public pushReplVariable(object: CDPPropertyDescriptor[]) {
    const objectDapID = getVariableId();
    this.replVariables.set(objectDapID, object);
    return objectDapID;
  }

  /**
   * clears the variables store
   */
  public clearReplVariables() {
    this.replVariables.clear();
  }

  public clearCDPVariables() {
    this.CDPtoDAPObjectIdMap = new Map();
    this.DAPtoCDPObjectIdMap = new Map();
  }

  public adaptCDPObjectId(objectId: string) {
    let dapObjectID = this.CDPtoDAPObjectIdMap.get(objectId);
    if (dapObjectID === undefined) {
      dapObjectID = getVariableId();
      this.CDPtoDAPObjectIdMap.set(objectId, dapObjectID);
      this.DAPtoCDPObjectIdMap.set(dapObjectID, objectId);
    }
    return dapObjectID;
  }

  private convertDAPObjectIdToCDP(dapObjectID: number) {
    return this.DAPtoCDPObjectIdMap.get(dapObjectID);
  }
}
