const path = require("path");
const fs = require("fs");
const os = require("os");

const appPath =
  os.platform() === "win32"
    ? path.join(process.env.PROGRAMFILES, "Purple HATS Desktop")
    : path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Purple HATS"
      );

//TODO: maybe delete this entire thing?
const getLatestErrorLog = () => {
    const errorLogPath = path.join(appPath, 'errors.txt');

    const errorLog = fs.readFileSync(errorLogPath, 'utf-8');

    const regex = /{.*?}/gs; 
    const entries = errorLog.match(regex);
    console.log('ENTRIES: ', entries);

    const latest = entries.pop(); 
    console.log('LATEST: ', latest);
}

getLatestErrorLog();