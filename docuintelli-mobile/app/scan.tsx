import { Redirect } from 'expo-router';

// Scan is now part of the upload workflow
export default function ScanRedirect() {
  return <Redirect href="/upload" />;
}
