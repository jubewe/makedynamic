const fs = require("fs");
const path = require("path");
const conststartreg = () => {
  return /^const\s(?=\w+)/;
};
const constrequirereg = () => {
  return /^const\s\w+\s=\srequire\(".+\"\)/;
};
const logsDir = "./logs";

const processArgs = {
  d: {
    keys: ["d", "D", "dir", "directory"],
    allowArgs: true,
    argsLength: 1,
  },
  sf: {
    keys: ["sf", "skipfile"],
    allowArgs: true,
  },
  sd: {
    keys: ["sd", "skipdir"],
    allowArgs: true,
  },
  dry: {
    keys: ["dry", "dryrun", "dry-run"],
  },
};
const skippedDirNamesDefault = ["node_modules", ".git"];
const skippedFileNamesDefault = [];

const jsFilePathsAll = [];
const jsFilePaths = [];
const directoryPathsAll = [];
const directoryPaths = [];
const matches = [];
const logs = [];

function log(...args) {
  logs.push({ type: "LOG", message: [...args].join(";") });
  console.log(...args);
}

let lastCommand;
process.argv.slice(2).map((a) => {
  if (/^\-+\w+$/g.test(a)) {
    const b = a.replace(/^\-+/, "");
    const c = Object.keys(processArgs).filter((a) =>
      processArgs[a].keys.includes(b)
    )?.[0];
    if (!c) return (lastCommand = undefined);
    const d = processArgs[c];
    d.args = [];
    lastCommand = d;
  } else if (
    lastCommand &&
    lastCommand.allowArgs &&
    (!lastCommand.allowArgs ||
      !lastCommand.argsLength ||
      lastCommand.args.length < lastCommand.argsLength)
  ) {
    lastCommand.args.push(a);
  }
});

const dirPath =
  processArgs.d?.args?.[0] ??
  ((process.argv[2]?.replace(/^\-\w+/, "")?.length ?? 0) !== 0
    ? process.argv[2]
    : undefined);
if (!dirPath) throw Error("No dirPath defined");

const skippedDirNames = (processArgs.sd.args ?? skippedDirNamesDefault)
  .join(";")
  .split(";");
const skippedFileNames = (processArgs.sf.args ?? skippedFileNamesDefault)
  .join(";")
  .split(";");
const dryRun = processArgs.dry.args !== undefined;

log(`Scanning directory ${dirPath} (${path.resolve(dirPath)})`);
const start = Date.now();

function rd(p) {
  const dir = fs.readdirSync(p, { withFileTypes: true });

  dir.forEach((entry) => {
    let p2 = path.resolve(p, entry.name);
    if (entry.isDirectory()) {
      directoryPathsAll.push(p);
      if (!skippedDirNames.includes(entry.name)) rd(p2);
    } else if (entry.isFile()) {
      jsFilePathsAll.push(p2);
      if (!skippedFileNames.includes(entry.name) && /\.js$/.test(entry.name))
        jsFilePaths.push(path.resolve(p, entry.name));
    }
  });
}

rd(dirPath);

const dirScanLength = Date.now() - start;

log(
  `Found ${jsFilePaths.length} matching (Total: ${jsFilePathsAll.length}) JS files in ` +
    `${directoryPaths.length} matching (Total: ${directoryPathsAll.length}) Subdirectories (Scanning took ${dirScanLength} ms)`
);

log(`Starting search`);

const jsFileReadStart = Date.now();

jsFilePaths.forEach((jsFilePath) => {
  let jsFile = fs.readFileSync(jsFilePath, "utf-8");
  let jsFileSplits = jsFile.split("\n");

  let fileChanged = false;
  for (let i = 3; i < jsFileSplits.length; i++) {
    const line = jsFileSplits[i];
    if (conststartreg().test(line)) {
      if (constrequirereg().test(line)) {
        logs.push({
          type: "REPLACE",
          filePath: jsFilePath,
          lineIndex: i,
          line: line,
        });
        matches.push([jsFilePath, line]);
        fileChanged = true;
        jsFileSplits[i] = line.replace(conststartreg(), "let ");
      }
    } else {
      if (i > 10) break;
    }
  }

  if (!dryRun && fileChanged)
    fs.writeFileSync(jsFilePath, jsFileSplits.join("\n"));
});

const jsFileChangeLength = Date.now() - jsFileReadStart;
const jsFullLength = Date.now() - start;
log(
  `${dryRun ? "[DRY] " : ""}Found ${!dryRun ? "and replaced " : ""}${
    matches.length
  } matches`
);
log(
  `(Searching Directory took ${dirScanLength} ms; Reading/Searching ${
    !dryRun ? "and Replacing " : ""
  }Files Took ${jsFileChangeLength} ms; Whole process took ${jsFullLength} ms)`
);

if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
let logfilepath = `${logsDir}/log-${new Date(
  new Date().setMinutes(
    new Date().getMinutes() - new Date().getTimezoneOffset()
  )
).toISOString()}.json`;
fs.writeFileSync(logfilepath, JSON.stringify({ logs: logs }), "utf-8");
console.log(`Saved Log to ${path.resolve(logfilepath)}`);
