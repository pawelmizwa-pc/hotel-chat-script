import { UTMTracking } from "../types";

/**
 * Extract UTM parameters from a URL or query string
 * @param url - The URL or query string to extract UTM parameters from
 * @returns UTMTracking object with extracted parameters
 */
export function extractUTMFromURL(url: string): UTMTracking | null {
  try {
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;

    const utmData: UTMTracking = {};
    let hasUTMData = false;

    // Standard UTM parameters
    const utmParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
    ];

    // Click ID parameters
    const clickIdParams = ["gclid", "fbclid", "msclkid"];

    // Extract UTM parameters
    utmParams.forEach((param) => {
      const value = searchParams.get(param);
      if (value) {
        utmData[param] = value;
        hasUTMData = true;
      }
    });

    // Extract click ID parameters
    clickIdParams.forEach((param) => {
      const value = searchParams.get(param);
      if (value) {
        utmData[param] = value;
        hasUTMData = true;
      }
    });

    return hasUTMData ? utmData : null;
  } catch (error) {
    console.warn("Error extracting UTM parameters from URL:", error);
    return null;
  }
}

/**
 * Extract UTM parameters from a query string
 * @param queryString - The query string (without the '?')
 * @returns UTMTracking object with extracted parameters
 */
export function extractUTMFromQueryString(
  queryString: string
): UTMTracking | null {
  try {
    // Add a dummy domain to make it a valid URL for URLSearchParams
    const searchParams = new URLSearchParams(queryString);

    const utmData: UTMTracking = {};
    let hasUTMData = false;

    // Extract all UTM and click ID parameters
    for (const [key, value] of searchParams.entries()) {
      if (
        key.startsWith("utm_") ||
        ["gclid", "fbclid", "msclkid"].includes(key)
      ) {
        utmData[key] = value;
        hasUTMData = true;
      }
    }

    return hasUTMData ? utmData : null;
  } catch (error) {
    console.warn("Error extracting UTM parameters from query string:", error);
    return null;
  }
}

/**
 * Validate UTM tracking data
 * @param utmData - UTM tracking data to validate
 * @returns true if valid, false otherwise
 */
export function validateUTMData(utmData: UTMTracking): boolean {
  if (!utmData || typeof utmData !== "object") {
    return false;
  }

  // Check if at least one UTM parameter or click ID is present
  const hasUTMParam = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
  ].some((param) => utmData[param]);

  const hasClickId = ["gclid", "fbclid", "msclkid"].some(
    (param) => utmData[param]
  );

  return hasUTMParam || hasClickId;
}

/**
 * Clean UTM data by removing empty values and trimming strings
 * @param utmData - UTM tracking data to clean
 * @returns Cleaned UTM tracking data
 */
export function cleanUTMData(utmData: UTMTracking): UTMTracking {
  const cleaned: UTMTracking = {};

  Object.entries(utmData).forEach(([key, value]) => {
    if (value && typeof value === "string" && value.trim()) {
      cleaned[key] = value.trim();
    }
  });

  return cleaned;
}

/**
 * Create a marketing attribution summary from UTM data
 * @param utmData - UTM tracking data
 * @returns Marketing attribution summary
 */
export function createAttributionSummary(utmData: UTMTracking): {
  source: string;
  medium: string;
  campaign: string;
  hasClickId: boolean;
} {
  return {
    source: utmData.utm_source || "direct",
    medium: utmData.utm_medium || "none",
    campaign: utmData.utm_campaign || "none",
    hasClickId: !!(utmData.gclid || utmData.fbclid || utmData.msclkid),
  };
}
