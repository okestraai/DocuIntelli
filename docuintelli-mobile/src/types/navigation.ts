export type RootStackParamList = {
  '(auth)/login': undefined;
  '(auth)/signup': undefined;
  '(auth)/verify-otp': { email: string; flow: 'signup' | 'reset' };
  '(auth)/forgot-password': undefined;
  '(tabs)/dashboard': undefined;
  '(tabs)/vault': undefined;
  '(tabs)/chat': undefined;
  '(tabs)/settings': undefined;
  'document/[id]': { id: string };
  'document/[id]/chat': { id: string };
  scan: undefined;
  upload: undefined;
  search: undefined;
  'life-events': undefined;
  audit: undefined;
  billing: undefined;
};
