// Demo logins shown on the login screen. Must match scripts/seed.ts and the
// Supabase test OTP list (Authentication → Phone → Test OTPs).
// Demo logins show when explicitly enabled or when running without Supabase (mock backend).
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL;
export const DEMO_OTP = '123456';

export const DEMO_ACCOUNTS = [
  { phone: '9999900001', name: 'Amit Sharma', role: 'customer' },
  { phone: '9999900002', name: 'Priya Verma', role: 'customer' },
  { phone: '9999910001', name: 'Ramesh Yadav', role: 'worker', note: 'Loading · Transport Nagar' },
  { phone: '9999910002', name: 'Sohan Kumar', role: 'worker', note: 'Loading · Sodala' },
  { phone: '9999910011', name: 'Sunita Devi', role: 'worker', note: 'Cleaning' },
  { phone: '9999910013', name: 'Pappu Ram', role: 'worker', note: 'Pending verification' },
  { phone: '9999900000', name: 'Admin', role: 'admin' },
] as const;
