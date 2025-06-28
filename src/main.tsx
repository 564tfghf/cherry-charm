/*
 *  Copyright (c) Michael Kolesidis <michael.kolesidis@gmail.com>
 *  GNU Affero General Public License v3.0
 *
 *  ATTENTION! FREE SOFTWARE
 *  This website is free software (free as in freedom).
 *  If you use any part of this code, you must make your entire project's source code
 *  publicly available under the same license. This applies whether you modify the code
 *  or use it as it is in your own project. This ensures that all modifications and
 *  derivative works remain free software, so that everyone can benefit.
 *  If you are not willing to comply with these terms, you must refrain from using any part of this code.
 *
 *  For full license terms and conditions, you can read the AGPL-3.0 here:
 *  https://www.gnu.org/licenses/agpl-3.0.html
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { ToastContainer } from 'react-toastify';
import App from './App.tsx';
import { MONAD_TESTNET } from './hooks/useBlockchainGame.tsx';
import './style.css';
import 'react-toastify/dist/ReactToastify.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PrivyProvider
      appId="cmbi8jxhs000zju0mbg0xx3v3"
      config={{
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          noPromptOnSignature: true, // ✅ Prevents signature prompts
          requireUserPasswordOnCreate: false, // ✅ No password required
          showWalletUIs: false, // ✅ Hide wallet UI prompts
          priceDisplay: {
            primary: 'native-token',
            secondary: 'fiat-currency',
          },
        },
        // ✅ Additional settings to prevent transaction approval prompts
        mfa: {
          noPromptOnMfaRequired: true,
        },
        loginMethods: ['email', 'google', 'twitter'],
        appearance: {
          theme: 'light',
          accentColor: '#3b0873',
          logo: './images/logo.png',
          showWalletLoginFirst: false, // ✅ Don't show wallet options first
        },
        supportedChains: [MONAD_TESTNET],
        defaultChain: MONAD_TESTNET,
        // ✅ Session configuration for seamless transactions
        session: {
          sameSite: 'lax',
          secure: true,
        },
        // ✅ Additional wallet configuration
        walletConnectCloudProjectId: undefined, // Disable WalletConnect
        solanaClusters: [], // Disable Solana
      }}
    >
      <App />
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </PrivyProvider>
  </React.StrictMode>
);