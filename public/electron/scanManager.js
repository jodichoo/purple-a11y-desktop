const { BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { fork, spawn } = require("child_process");
const fs = require("fs-extra");
const os = require("os");
const { randomUUID } = require("crypto");
const {
  enginePath,
  getPathVariable,
  customFlowGeneratedScriptsPath,
  playwrightBrowsersPath,
  javaPath,
  resultsPath,
  scanResultsPath,
  createPlaywrightContext,
  deleteClonedProfiles,
  backendPath,
} = require("./constants");
const {
  browserTypes,
  getDefaultChromeDataDir,
  getDefaultEdgeDataDir,
} = require("./constants");
const { env, report } = require("process");
const { readUserDataFromFile, createExportDir } = require("./userDataManager");
const scanHistory = {};

let currentChildProcess;

const killChildProcess = () => {
  if (currentChildProcess) {
    currentChildProcess.kill("SIGKILL");
  }
};

const getScanOptions = (details) => {
  const {
    scanType,
    fileTypes,
    url,
    customDevice,
    viewportWidth,
    maxPages,
    headlessMode,
    browser,
    email,
    name,
    exportDir,
    maxConcurrency,
    falsePositive
  } = details;
  const options = ["-c", scanType, "-u", url, "-k", `${name}:${email}`, "-i", fileTypes];

  if (customDevice) {
    options.push("-d", customDevice);
  }

  if (viewportWidth) {
    options.push("-w", viewportWidth);
  }

  if (maxPages) {
    options.push("-p", maxPages);
  }

  if (!headlessMode) {
    options.push("-h", "no");
  }

  if (browser) {
    options.push("-b", browser);
  }

  if (exportDir) {
    options.push("-e", exportDir);
  }

  if (maxConcurrency) {
    options.push("-t", 1);
  }

  if (maxConcurrency) {
    options.push("-t", 1);
  }

  if (falsePositive) {
    options.push("-f", "true");
  }

  return options;
};

const startScan = async (scanDetails, scanEvent) => {
  const { scanType, url } = scanDetails;
  console.log(`Starting new ${scanType} scan at ${url}.`);

  const userData = readUserDataFromFile();

  if (userData) {
    scanDetails.email = userData.email;
    scanDetails.name = userData.name;
    scanDetails.exportDir = userData.exportDir;
    const success = createExportDir(userData.exportDir);
    if (!success) return  { failedToCreateExportDir: true }
  }

  if (!getDefaultChromeDataDir() && os.platform() ==='darwin') {
    return { noChrome: true };
  }

  let useChromium = false;
  if (
    scanDetails.browser === browserTypes.chromium ||
    (!getDefaultChromeDataDir() && !getDefaultEdgeDataDir())
  ) {
    useChromium = true;
  }

  const response = await new Promise(async (resolve) => {
    const scan = spawn(
      `node`,
      [path.join(enginePath, "cli.js"), ...getScanOptions(scanDetails)],
      {
        cwd: resultsPath,
        env: {
          ...process.env,
          RUNNING_FROM_PH_GUI: true,
          ...(useChromium && {
            PLAYWRIGHT_BROWSERS_PATH: `${playwrightBrowsersPath}`,
            JAVA_HOME: `${javaPath}`
          }),
          PATH: getPathVariable(),
        },
      }
    );

    currentChildProcess = scan;

    scan.stderr.setEncoding("utf8");
    scan.stderr.on("data", function (data) {
      console.log("stderr: " + data);
    });

    scan.stdout.setEncoding("utf8");
    scan.stdout.on("data", async (data) => {
      /** Code 0 handled indirectly here (i.e. successful process run),
      as unable to get stdout on close event after changing to spawn from fork */

      // Output from combine.js which prints the string "No pages were scanned" if crawled URL <= 0
      // consider this as successful that the process ran,
      // but failure in the sense that no pages were scanned so that we can display a message to the user
      if (data.includes("No pages were scanned")) {
        scan.kill("SIGKILL");
        currentChildProcess = null;
        resolve({ success: false });
      }

      if (scanDetails.scanType === 'custom' && data.includes('generatedScript')) {
        const generatedScriptName = data.trim();
        console.log('generated script: ', generatedScriptName);
        const generatedScript = path.join(customFlowGeneratedScriptsPath, generatedScriptName);
        resolve({ success: true, generatedScript: generatedScript});
      }

      // The true success where the process ran and pages were scanned
      if (data.includes("Results directory is at")) {
        console.log(data);
        const resultsPath = data
          .split("Results directory is at ")[1]
          .split("/")
          .pop()
          .split(" ")[0];
        console.log(resultsPath);
        const scanId = randomUUID();
        scanHistory[scanId] = resultsPath;
        scan.kill("SIGKILL");
        currentChildProcess = null;
        await cleanUpIntermediateFolders(resultsPath);
        resolve({ success: true, scanId });
      }

      // Handle live crawling output
      if (data.includes("Electron crawling")) {
        const urlScannedNum = parseInt(data.split("::")[1].trim());
        const status = data.split("::")[2].trim();
        const url = data.split("::")[3].trim();
        console.log(urlScannedNum, ": ", status, ": ", url);
        scanEvent.emit("scanningUrl", {status, url, urlScannedNum});
      }

      if (data.includes("Starting scan")) {
        console.log(data);
      }

      if (data.includes("Electron scan completed")) {
        console.log(data);
        scanEvent.emit("scanningCompleted");
      }
    });

    // Only handles error code closes (i.e. code > 0)
    // as successful resolves are handled above
    scan.on("close", (code) => {
      if (code !== 0) {
        resolve({ success: false, statusCode: code });
      }
      currentChildProcess = null;
    });
  });

  return response;
};

const startReplay = async (generatedScript, scanDetails, scanEvent, isReplay) => {
  let useChromium = false;
  if (
    scanDetails.browser === browserTypes.chromium ||
    (!getDefaultChromeDataDir() && !getDefaultEdgeDataDir())
  ) {
    useChromium = true;
  }

  const response = await new Promise((resolve, reject) => {
    const replay = spawn(`node`, [path.join(enginePath, "runCustomFlowFromGUI.js"), generatedScript], {
      cwd: resultsPath,
      env: {
        ...process.env,
        RUNNING_FROM_PH_GUI: true,
        ...(useChromium && {
          PLAYWRIGHT_BROWSERS_PATH: `${playwrightBrowsersPath}`,
        }),
        PATH: getPathVariable(),
      },
    });

    currentChildProcess = replay;

    replay.stderr.setEncoding("utf8");
    replay.stderr.on("data", function (data) {
      console.log("stderr: " + data);
    });

    replay.stdout.setEncoding("utf8");
    replay.stdout.on("data", async (data) => {
      if (data.includes("An error has occurred when running the custom flow scan.")) {
        replay.kill("SIGKILL");
        currentChildProcess = null;
        resolve({ success: false });
      }

      // Handle live crawling output
      if (data.includes("Electron crawling:")) {
        const urlScannedNum = parseInt(data.split("::")[1].trim());
        const status = data.split("::")[2].trim();
        const url = data.split("::")[3].trim();
        console.log(urlScannedNum, ":", status, ":", url);
        scanEvent.emit("scanningUrl", {status, url, urlScannedNum});
      }

      if (data.includes("Electron scan completed")) {
        scanEvent.emit("scanningCompleted");
      }

      if (data.includes("results/")) {
        console.log(data);
        const resultsFolderName = data.split(" ").slice(-2)[0].split("/").pop();
        console.log(resultsFolderName);

        const scanId = randomUUID();
        scanHistory[scanId] = resultsFolderName;

        moveCustomFlowResultsToExportDir(scanId, resultsFolderName, isReplay);
        replay.kill("SIGKILL");
        currentChildProcess = null;
        await cleanUpIntermediateFolders(resultsFolderName);
        resolve({ success: true, scanId });
      }
    });

    replay.on("close", (code) => {
      if (code !== 0) {
        resolve({ success: false, statusCode: code });
      }
    });
  });

  return response;
};

const generateReport = (customFlowLabel, scanId) => {
  const currentFolderNameList = scanHistory[scanId].split('_');
  const currentResultsFolderPath = getResultsFolderPath(scanId);
  const newFolderNameList = [
    ...currentFolderNameList.slice(0, 2),
    customFlowLabel,
    ...currentFolderNameList.slice(2)
  ]
  const newFolderName = newFolderNameList.toString().replaceAll(',', '_');
  console.log(newFolderName);
  scanHistory[scanId] = newFolderName;
  const newResultsFolderPath = getResultsFolderPath(scanId);
  fs.renameSync(currentResultsFolderPath, newResultsFolderPath)

  const reportPath = getReportPath(scanId);
  const data = fs.readFileSync(reportPath, { encoding: "utf-8" });
  const result = data.replaceAll(/Custom Flow/g, customFlowLabel);
  fs.writeFileSync(reportPath, result);
};

const getReportPath = (scanId) => {
  const resultsFolderPath = getResultsFolderPath(scanId);
  if (scanHistory[scanId]) {
    return path.join(
      resultsFolderPath,
      "reports",
      "report.html"
    );
  }
  return null;
};

const getResultsFolderPath = (scanId) => {
  const exportDir = readUserDataFromFile().exportDir; 
  return path.join(
    exportDir,
    scanHistory[scanId]
  )
}

const mailResults = async (formDetails, scanId) => {
  const reportPath = getReportPath(scanId);
  const { subject, emailAddresses } = formDetails;

  const shellCommand = `
    if ((Split-Path -Path $pwd -Leaf) -eq "scripts") {
      cd ..
    }
    $attachmentCount = 0
    #Get an Outlook application object
    $wasOutlookOpened = $true
    try {
      $o = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    } catch {
      # Outlook is not open, create a new instance
      $o = New-Object -ComObject Outlook.Application
      $wasOutlookOpened = $false
    }
    if ($null -eq $o) {
      throw "Unable to open outlook"
      exit
    }
    $mail = $o.CreateItem(0)
    $mail.subject = "${subject}"
    $mail.body = "Hi there,
    
Please see the attached accessibility scan results with Purple HATS (report.html).
Feel free to reach us at accessibility@tech.gov.sg if you have any questions.

Thank you.
Accessibility Enabling Team"
    $mail.To = "${emailAddresses}"
    $mail.cc = "<accessibility@tech.gov.sg>"
    # # Iterate over all files and only add the ones that have an .html extension
    $files = Get-ChildItem '${reportPath}'
    for ($i = 0; $i -lt $files.Count; $i++) {
      $outfileName = $files[$i].FullName
      $outfileNameExtension = $files[$i].Extension
      if ($outfileNameExtension -eq ".html") {
          $mail.Attachments.Add($outfileName);
          $attachmentCount++
      }
    }
    if ($attachmentCount -eq 0) {
      throw "No files were found in the specified folder. Exiting."
      $o.Quit()
      exit
    }
    $mail.Send()
    # give time to send the email
    Start-Sleep -Seconds 5
    # quit Outlook only if previously not opened
    if ($wasOutlookOpened -eq $false) {
      $o.Quit()
    }
    #end the script
    exit
  `;

  const response = await new Promise((resolve) => {
    const mailProcess = spawn("powershell.exe", [
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      shellCommand,
    ]);

    mailProcess.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
      resolve({
        success: false,
        message: `An error has occurred when sending the email: ${data}`,
      });
    });

    mailProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        mailProcess.stderr.on("data", (data) => {
          console.error(`stderr: ${data}`);
          resolve({
            success: false,
            message: `An error has occurred when sending the email: ${data}`,
          });
        });
      }
    });
  });

  return response;
};

const cleanUpIntermediateFolders = async (folderName, setDefaultFolders = false) => {
  const pathToDelete = path.join(resultsPath, folderName);
  await fs.pathExists(pathToDelete).then(exists => {
    if (exists) {
      fs.removeSync(pathToDelete);
    }
  });
};

const cleanUpCustomFlowGeneratedScripts = () => {
  if (fs.existsSync(customFlowGeneratedScriptsPath)) {
    fs.rm(customFlowGeneratedScriptsPath, { recursive: true }, (err) => {
      if (err) {
        console.error(
          `Error while deleting ${customFlowGeneratedScriptsPath}.`
        );
      }
    });
  }
}

const moveCustomFlowResultsToExportDir = (scanId, resultsFolderName, isReplay) => {
  const currentResultsPath = path.join(scanResultsPath, resultsFolderName);
  let newResultsPath;
  if (isReplay) {
    const [date, time] = new Date().toLocaleString('sv').replaceAll(/-|:/g, '').split(' ');
    const domain = currentResultsPath.split("_").pop();
    const newResultsFolderName = `${date}_${time}_${domain}`;
    scanHistory[scanId] = newResultsFolderName;;
    newResultsPath = getResultsFolderPath(scanId);
  } else {
    newResultsPath = getResultsFolderPath(scanId);
  }
  fs.move(currentResultsPath, newResultsPath, (err) => {
    if (err) return console.log(err);
  })
}

const init = (scanEvent) => {
  ipcMain.handle("startScan", async (_event, scanDetails) => {
    return await startScan(scanDetails, scanEvent);
  });

  ipcMain.handle("startReplay", async (_event, generatedScript, scanDetails, isReplay) => {
    return await startReplay(generatedScript, scanDetails, scanEvent, isReplay);
  })

  ipcMain.on("generateReport", (_event, customFlowLabel, scanId) => {
    return generateReport(customFlowLabel, scanId);
  });

  ipcMain.on("openReport", async (_event, scanId) => {
    const reportPath = getReportPath(scanId);
    if (!reportPath) return;
    shell.openExternal(`file://${reportPath}`);
  });

  ipcMain.handle("getResultsFolderPath", async (_event, scanId) => {
    const resultsPath = getResultsFolderPath(scanId);
    return resultsPath;
  })

  ipcMain.on("cleanUpCustomFlowScripts", async () => {
    cleanUpCustomFlowGeneratedScripts();
  })

  ipcMain.handle("mailReport", (_event, formDetails, scanId) => {
    return mailResults(formDetails, scanId);
  });
};

module.exports = {
  init,
  killChildProcess,
};
