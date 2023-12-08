/* This file provides methods that interfaces between the API functions exposed by the electron main process
and the renderer. The APIs are provided via the window.services object, as defined in ./public/preload.js
*/

import {
  scanTypes,
  viewportTypes,
  devices,
  fileTypes,
  forbiddenCharactersInDirPath,
  reserveFileNameKeywords,
  feedbackFormInputFields,
} from "./common/constants";

// for use in openUserDataForm
let currentScanUrl;
let currentScanType;

const validateUrlConnectivity = async (scanDetails) => {
  const {
    scanType: selectedScanType,
    scanUrl,
    viewport,
    device,
    viewportWidth,
    browser,
    fileTypes: selectedFileTypes,
  } = scanDetails;

  currentScanUrl = scanUrl;
  currentScanType = selectedScanType;

  const scanArgs = {
    scanType: scanTypes[selectedScanType],
    url: scanUrl,
    browser: browser,
    fileTypes: fileTypes[selectedFileTypes],
  };

  if (viewport === viewportTypes.mobile) {
    scanArgs.customDevice = "Mobile";
  }

  if (viewport === viewportTypes.specific) {
    scanArgs.customDevice = devices[device];
  }

  if (viewport === viewportTypes.custom) {
    scanArgs.viewportWidth = viewportWidth;
  }

  const response = await window.services.validateUrlConnectivity(scanArgs);
  return response;
};

const startScan = async (scanDetails) => {
  const {
    scanType: selectedScanType,
    scanUrl,
    pageLimit,
    viewport,
    device,
    viewportWidth,
    fileTypes: selectedFileTypes,
    // scanInBackground,
    browser,
    maxConcurrency,
    falsePositive,
    includeScreenshots,
    includeSubdomains,
    scanMetadata,
  } = scanDetails;

  currentScanUrl = scanUrl;
  currentScanType = selectedScanType;
  const scanArgs = {
    scanType: scanTypes[selectedScanType],
    url: scanUrl,
    headlessMode:
      scanTypes[selectedScanType] !== "custom" &&
      scanTypes[selectedScanType] !== "custom2",
    browser: browser,
    maxConcurrency: maxConcurrency,
    falsePositive: falsePositive,
    fileTypes: fileTypes[selectedFileTypes],
    includeScreenshots,
    includeSubdomains,
    metadata: JSON.stringify(scanMetadata),
  };

  if (
    scanTypes[selectedScanType] !== "custom" &&
    scanTypes[selectedScanType] !== "custom2"
  ) {
    scanArgs.maxPages = pageLimit;
  }

  if (viewport === viewportTypes.mobile) {
    scanArgs.customDevice = "Mobile";
  }

  if (viewport === viewportTypes.specific) {
    scanArgs.customDevice = devices[device];
  }

  if (viewport === viewportTypes.custom) {
    scanArgs.viewportWidth = viewportWidth;
  }

  const response = await window.services.startScan(scanArgs);
  return response;
};

const openReport = (scanId) => {
  window.services.openReport(scanId);
};

const getResultsFolderPath = async (scanId) => {
  const reportPath = await window.services.getResultsFolderPath(scanId);
  return reportPath;
};
const getUploadFolderPath = async () => {
  return await window.services.getUploadFolderPath();
};

const getUserData = async () => {
  const userData = await window.services.getUserData();
  return userData;
};

const getErrorLog = async (timeOfScan, timeOfError) => {
  console.log(timeOfScan, "services");
  const errorLog = await window.services.getErrorLog(timeOfScan, timeOfError);
  return errorLog;
};

const getDataForForm = async () => {
  const userData = await getUserData();
  const email = userData["email"];
  const name = userData["name"];
  const event = userData["event"];
  const browser = userData["browser"];
  const exportDir = userData["exportDir"];
  return {
    websiteUrl: currentScanUrl,
    scanType: currentScanType,
    email: email,
    name: name,
    event: event,
    browser: browser,
    exportDir: exportDir,
  };
};

const getFeedbackFormUrl = async () => {
  const { formUrl, urlScannedField, versionNumberField } =
    feedbackFormInputFields;
  const phEngineVersion = await window.services.getEngineVersion();
  const encodedUrlScanned = encodeURIComponent(currentScanUrl);
  const encodedVersionNumber = encodeURIComponent(phEngineVersion);
  const feedbackFormUrl = `${formUrl}/?${urlScannedField}=${encodedUrlScanned}&${versionNumberField}=${encodedVersionNumber}`;
  return feedbackFormUrl;
};

const isValidEmail = (email) => {
  const emailRegex = new RegExp(
    /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
    "gm"
  );

  return emailRegex.test(email);
};

const isValidCustomFlowLabel = (customFlowLabel) => {
  const containsReserveWithDot = reserveFileNameKeywords.some((char) =>
    customFlowLabel.toLowerCase().includes(char.toLowerCase() + ".")
  );
  const containsForbiddenCharacters = forbiddenCharactersInDirPath.some(
    (character) => customFlowLabel.includes(character)
  );
  const isEmpty = customFlowLabel.length <= 0;
  const exceedsMaxLength = customFlowLabel.length > 80;

  if (isEmpty) return { isValid: false, errorMessage: "Cannot be empty." };
  if (exceedsMaxLength)
    return { isValid: false, errorMessage: "Cannot exceed 80 characters." };
  if (containsForbiddenCharacters)
    return {
      isValid: false,
      errorMessage:
        `Cannot contain ${forbiddenCharactersInDirPath.toString()}`.replaceAll(
          ",",
          " , "
        ),
    };
  if (containsReserveWithDot)
    return {
      isValid: false,
      errorMessage: `Cannot have '.' appended to ${reserveFileNameKeywords
        .toString()
        .replaceAll(",", " , ")} as they are reserved keywords.`,
    };

  return { isValid: true };
};

const mailReport = async (formDetails, scanId) => {
  const response = await window.services.mailReport(formDetails, scanId);
  return response;
};

const getIsWindows = async () => window.services.getIsWindows();

const isValidName = (name) => {
  const nameRegex = /^(?=.{1,50}$)[A-Za-z-,\s]+$/;

  return nameRegex.test(name);
};

const services = {
  startScan,
  openReport,
  getResultsFolderPath,
  getUploadFolderPath,
  getUserData,
  getDataForForm,
  getFeedbackFormUrl,
  isValidEmail,
  mailReport,
  getIsWindows,
  isValidName,
  isValidCustomFlowLabel,
  validateUrlConnectivity,
  getErrorLog,
};

export default services;
