import assert from "assert";
import sinon from "sinon";
import { after } from "mocha";
import process from "process";
import { ABI, getNativeABI } from "./common";

after(() => {
  sinon.restore();
});

test("getNativeABI()", function () {
  stubIntelArch();

  assert.equal(getNativeABI(), ABI.X86);
});

function stubIntelArch() {
  sinon.stub(process, "arch").value("ia32");
}
