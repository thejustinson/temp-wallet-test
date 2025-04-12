'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

const DEVNET_ENDPOINT = 'https://api.devnet.solana.com';
const DEFAULT_SELLER_ADDRESS = '9RKnB9eWaBxX33spWTLm2333nE5QXgWfaC8BoS5Cj9Pf';
const DEFAULT_AMOUNT = 0.01; // SOL
const PAYMENT_WINDOW = 5 * 60; // 5 minutes in seconds
const POLLING_INTERVAL = 5000; // 5 seconds in milliseconds

export default function Home() {
  const [tempWallet, setTempWallet] = useState<Keypair | null>(null);
  const [timeLeft, setTimeLeft] = useState(PAYMENT_WINDOW);
  const [status, setStatus] = useState<'setup' | 'waiting' | 'received' | 'forwarding' | 'forwarded' | 'expired'>('setup');
  const [balance, setBalance] = useState(0);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sellerAddress, setSellerAddress] = useState(DEFAULT_SELLER_ADDRESS);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT.toString());
  const [amountError, setAmountError] = useState<string | null>(null);

  const connection = useMemo(() => new Connection(DEVNET_ENDPOINT), []);

  const validateAddress = useCallback((address: string) => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }, []);

  const validateAmount = useCallback((value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return 'Amount must be a valid number';
    }
    if (numValue <= 0) {
      return 'Amount must be greater than 0';
    }
    if (numValue > 100) {
      return 'Amount must be less than or equal to 100 SOL';
    }
    return null;
  }, []);

  const startPaymentFlow = useCallback(() => {
    setAddressError(null);
    setAmountError(null);

    if (!validateAddress(sellerAddress)) {
      setAddressError('Invalid Solana address');
      return;
    }

    const amountError = validateAmount(amount);
    if (amountError) {
      setAmountError(amountError);
      return;
    }

    const newWallet = Keypair.generate();
    setTempWallet(newWallet);
    setTimeLeft(PAYMENT_WINDOW);
    setStatus('waiting');
    setBalance(0);
    setTxSignature(null);
    setError(null);
  }, [sellerAddress, amount, validateAddress, validateAmount]);

  const resetFlow = useCallback(() => {
    setStatus('setup');
    setTempWallet(null);
    setError(null);
    setTxSignature(null);
  }, []);

  useEffect(() => {
    if (!tempWallet || status !== 'waiting') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [tempWallet, status]);

  useEffect(() => {
    if (!tempWallet || status !== 'waiting') return;

    const checkBalance = async () => {
      try {
        const balance = await connection.getBalance(tempWallet.publicKey);
        const balanceInSol = balance / LAMPORTS_PER_SOL;
        setBalance(balanceInSol);

        const requiredAmount = parseFloat(amount);
        if (balanceInSol >= requiredAmount) {
          setStatus('received');
          setStatus('forwarding');
          try {
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: tempWallet.publicKey,
                toPubkey: new PublicKey(sellerAddress),
                lamports: balance - 5000
              })
            );

            const signature = await connection.sendTransaction(transaction, [tempWallet]);
            await connection.confirmTransaction(signature);
            
            setTxSignature(signature);
            setStatus('forwarded');
          } catch (err) {
            setError('Failed to forward payment: ' + (err as Error).message);
            setStatus('waiting');
          }
        }
      } catch (err) {
        setError('Failed to check balance: ' + (err as Error).message);
      }
    };

    const interval = setInterval(checkBalance, POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [tempWallet, status, connection, sellerAddress, amount]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setAmount(value);
    setAmountError(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'bg-yellow-400';
      case 'received': return 'bg-blue-400';
      case 'forwarding': return 'bg-blue-400';
      case 'forwarded': return 'bg-green-400';
      default: return 'bg-red-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting': return 'Waiting for Payment';
      case 'received': return 'Payment Received';
      case 'forwarding': return 'Forwarding Payment';
      case 'forwarded': return 'Payment Complete';
      case 'expired': return 'Payment Expired';
      default: return 'Setup Payment';
    }
  };

  return (
    <motion.main 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen py-6 px-4 sm:py-12"
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900">
            Temp Wallet Flow Test
          </h1>
          <p className="mt-2 text-gray-600">Send SOL to complete the payment</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {status === 'setup' ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="card p-6 sm:p-8 max-w-xl mx-auto"
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Setup</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="seller-address" className="block text-sm font-medium text-gray-700 mb-1">
                    Seller Address
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      id="seller-address"
                      value={sellerAddress}
                      onChange={(e) => {
                        setSellerAddress(e.target.value);
                        setAddressError(null);
                      }}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Enter Solana address"
                    />
                    {addressError && (
                      <p className="mt-1 text-sm text-red-600">{addressError}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (SOL)
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      id="amount"
                      value={amount}
                      onChange={handleAmountChange}
                      step="0.000001"
                      min="0.000001"
                      max="100"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Enter amount in SOL"
                    />
                    {amountError && (
                      <p className="mt-1 text-sm text-red-600">{amountError}</p>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Enter an amount between 0 and 100 SOL
                  </p>
                </div>
                <button
                  onClick={startPaymentFlow}
                  className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Start Payment Flow
                </button>
              </div>
            </motion.div>
          ) : status === 'forwarding' ? (
            <motion.div
              key="forwarding"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="card p-6 sm:p-8 text-center"
            >
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                <h2 className="text-lg font-semibold text-gray-900">Forwarding Payment</h2>
                <p className="text-gray-600">Please wait while we forward the payment to the seller...</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="main-content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="card"
            >
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">Payment Details</h2>
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
                      <span className="text-sm text-gray-600">{getStatusText(status)}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Required Amount</span>
                      <span className="font-mono font-medium">{parseFloat(amount).toFixed(6)} SOL</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Current Balance</span>
                      <span className="font-mono font-medium">{balance.toFixed(6)} SOL</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Time Remaining</span>
                      <span className="font-mono font-medium">
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-gray-600">Seller Address</span>
                      <span className="font-mono font-medium text-sm truncate max-w-[200px]" title={sellerAddress}>
                        {sellerAddress.slice(0, 4)}...{sellerAddress.slice(-4)}
                      </span>
                    </div>
                  </div>

                  {status === 'waiting' && (
                    <div className="mt-6">
                      <div className="h-1 w-full bg-gray-100 rounded-full">
                        <motion.div
                          className="h-1 bg-blue-500 rounded-full"
                          style={{ width: `${(timeLeft / PAYMENT_WINDOW) * 100}%` }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 sm:p-6 flex flex-col items-center justify-center">
                  <div className="bg-gray-50 p-4 sm:p-6 rounded-xl mb-4">
                    <QRCodeSVG 
                      value={tempWallet?.publicKey.toString() || ''}
                      size={180}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">Wallet Address:</p>
                      <motion.button
                        onClick={() => handleCopy(tempWallet?.publicKey.toString() || '')}
                        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded-md"
                        whileTap={{ scale: 0.95 }}
                        title="Copy address"
                      >
                        <AnimatePresence mode="wait">
                          {copied ? (
                            <motion.div
                              key="copied"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-1"
                            >
                              <motion.svg
                                className="w-4 h-4 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </motion.svg>
                              <span className="text-green-500">Copied!</span>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="copy"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex items-center gap-1"
                            >
                              <motion.svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </motion.svg>
                              <span>Copy</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </div>
                    <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <p className="font-mono text-sm break-all text-gray-600">
                        {tempWallet?.publicKey.toString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {status === 'forwarded' && (
          <motion.div 
            className="card p-6 sm:p-8 mt-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center border border-green-100">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Payment Complete</h2>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-sm text-gray-600 mb-2">Transaction ID:</p>
              <p className="font-mono text-sm break-all text-gray-800">{txSignature}</p>
            </div>
          </motion.div>
        )}

        {(status === 'forwarded' || status === 'expired') && (
          <motion.button
            onClick={resetFlow}
            className="w-full mt-6 py-3 px-4 bg-white border border-gray-200 text-gray-900 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            Start New Payment
          </motion.button>
        )}

        <AnimatePresence>
          {error && (
            <motion.div 
              className="mt-6 card p-4 border-l-4 border-red-500"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center text-red-600">
                <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.main>
  );
}
