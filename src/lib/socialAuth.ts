// Social authentication utilities
export interface SocialAuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    provider: 'google' | 'facebook';
  };
  error?: string;
}

// Google OAuth configuration
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id';

// Facebook App configuration
export const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || 'your-facebook-app-id';

// Google OAuth integration
export const initializeGoogleAuth = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.google) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCallback,
      });
      resolve(true);
    } else {
      // Load Google Identity Services script
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback,
        });
        resolve(true);
      };
      document.head.appendChild(script);
    }
  });
};

const handleGoogleCallback = (response: unknown) => {
  if (!response || typeof response !== 'object' || !('credential' in response)) {
    console.warn('Unexpected Google auth response', response);
    return;
  }

  const credential = (response as { credential?: string }).credential;
  if (!credential) return;

  // Decode JWT token to get user info
  const userInfo = parseJwt(credential);
  console.log('Google user info:', userInfo);
  
  // In a real app, you would send this to your backend
  // to create/authenticate the user
};

// Facebook SDK integration
export const initializeFacebookSDK = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.FB) {
      resolve(true);
      return;
    }

    // Load Facebook SDK
    window.fbAsyncInit = function() {
      window.FB.init({
        appId: FACEBOOK_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v18.0'
      });
      resolve(true);
    };

    // Load the SDK asynchronously
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    document.head.appendChild(script);
  });
};

export const loginWithGoogle = async (): Promise<SocialAuthResult> => {
  try {
    await initializeGoogleAuth();
    
      return new Promise((resolve) => {
        window.google.accounts.id.prompt((notification: GooglePromptNotification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // Fallback to popup
          window.google.accounts.id.renderButton(
            document.getElementById('google-signin-button'),
            { theme: 'outline', size: 'large' }
          );
        }
      });
      
      // For demo purposes, simulate successful login
      setTimeout(() => {
        resolve({
          success: true,
          user: {
            id: 'google_123',
            email: 'user@gmail.com',
            name: 'John Doe',
            picture: 'https://via.placeholder.com/150',
            provider: 'google'
          }
        });
      }, 1000);
    });
    } catch (error) {
      console.error('Google login failed:', error);
      return {
        success: false,
        error: 'Google login failed'
    };
  }
};

export const loginWithFacebook = async (): Promise<SocialAuthResult> => {
  try {
    await initializeFacebookSDK();
    
      return new Promise((resolve) => {
        window.FB.login((response: FacebookLoginResponse) => {
          if (response.authResponse) {
            // Get user info
            window.FB.api('/me', { fields: 'name,email,picture' }, (userInfo: FacebookUserInfo) => {
            resolve({
              success: true,
              user: {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name,
                picture: userInfo.picture?.data?.url,
                provider: 'facebook'
              }
            });
          });
        } else {
          resolve({
            success: false,
            error: 'Facebook login cancelled'
          });
        }
      }, { scope: 'email' });
    });
    } catch (error) {
      console.error('Facebook login failed:', error);
      return {
        success: false,
        error: 'Facebook login failed'
    };
  }
};

// Utility function to parse JWT token
const parseJwt = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return null;
  }
};

// Type declarations for global objects
declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: unknown) => void }) => void;
          prompt: (cb: (notification: GooglePromptNotification) => void) => void;
          renderButton: (element: HTMLElement | null, options: Record<string, unknown>) => void;
        };
      };
    };
    FB: {
      init: (config: Record<string, unknown>) => void;
      login: (cb: (response: FacebookLoginResponse) => void, options: Record<string, string>) => void;
      api: (
        path: string,
        params: Record<string, string>,
        cb: (userInfo: FacebookUserInfo) => void
      ) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface GooglePromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
}

interface FacebookLoginResponse {
  authResponse?: unknown;
}

interface FacebookUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: { data?: { url?: string } };
}