/**
 * FHIR API Service
 *
 * Handles FHIR API calls to the EHR server (Practice Fusion)
 * The FHIR base URL is the `iss` from the SMART launch
 */

import type { FhirPatient } from '@myhealthurl/shared';

interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  issue: Array<{
    severity: string;
    code: string;
    diagnostics?: string;
  }>;
}

/**
 * Make a FHIR API request
 */
async function fhirRequest<T>(
  fhirBaseUrl: string,
  path: string,
  accessToken: string
): Promise<T> {
  const url = `${fhirBaseUrl}/${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/fhir+json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `FHIR request failed: ${response.status}`;

    try {
      const outcome = JSON.parse(errorText) as FhirOperationOutcome;
      if (outcome.resourceType === 'OperationOutcome') {
        errorMessage = outcome.issue.map((i) => i.diagnostics || i.code).join(', ');
      }
    } catch {
      errorMessage = errorText || errorMessage;
    }

    throw new Error(errorMessage);
  }

  return await response.json() as T;
}

/**
 * Fetch a Patient resource by ID
 */
export async function getPatient(
  fhirBaseUrl: string,
  patientId: string,
  accessToken: string
): Promise<FhirPatient> {
  return fhirRequest<FhirPatient>(fhirBaseUrl, `Patient/${patientId}`, accessToken);
}

/**
 * Extract patient display name from FHIR Patient resource
 */
export function getPatientDisplayName(patient: FhirPatient): string {
  if (!patient.name || patient.name.length === 0) {
    return 'Unknown Patient';
  }

  const name = patient.name[0];

  // Try formatted text first
  if (name.text) {
    return name.text;
  }

  // Build from components
  const parts: string[] = [];

  if (name.prefix) {
    parts.push(...name.prefix);
  }

  if (name.given) {
    parts.push(...name.given);
  }

  if (name.family) {
    parts.push(name.family);
  }

  if (name.suffix) {
    parts.push(...name.suffix);
  }

  return parts.join(' ') || 'Unknown Patient';
}

/**
 * Extract patient phone number from FHIR Patient resource
 */
export function getPatientPhone(patient: FhirPatient): string | undefined {
  const phone = patient.telecom?.find(
    (t) => t.system === 'phone' && (t.use === 'mobile' || t.use === 'home')
  );
  return phone?.value;
}

/**
 * Extract patient email from FHIR Patient resource
 */
export function getPatientEmail(patient: FhirPatient): string | undefined {
  const email = patient.telecom?.find((t) => t.system === 'email');
  return email?.value;
}

/**
 * Format patient birth date
 */
export function formatBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return 'Unknown';

  try {
    const date = new Date(birthDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return birthDate;
  }
}

/**
 * Get patient gender display
 */
export function getGenderDisplay(gender: string | undefined): string {
  if (!gender) return 'Unknown';

  const genderMap: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    unknown: 'Unknown',
  };

  return genderMap[gender.toLowerCase()] || gender;
}
