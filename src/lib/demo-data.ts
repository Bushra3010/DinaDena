// Demo people, trades and locations shared by scripts/seed.ts (Supabase) and the in-browser mock backend.

export const categories = [
  { slug: 'loading', name_en: 'Loading & Unloading', name_hi: 'लोडिंग-अनलोडिंग', icon: 'truck', daily_rate: 800, hourly_rate: 250, sort: 1 },
  { slug: 'furniture', name_en: 'Furniture Moving', name_hi: 'फर्नीचर शिफ्टिंग', icon: 'sofa', daily_rate: 900, hourly_rate: 200, sort: 2 },
  { slug: 'cleaning', name_en: 'Cleaning', name_hi: 'सफ़ाई', icon: 'sparkles', daily_rate: 700, hourly_rate: 150, sort: 3 },
  { slug: 'helper', name_en: 'Helper', name_hi: 'हेल्पर', icon: 'hand', daily_rate: 600, hourly_rate: 150, sort: 4 },
  { slug: 'mason', name_en: 'Mason', name_hi: 'राजमिस्त्री', icon: 'brick', daily_rate: 1000, hourly_rate: 200, sort: 5 },
  { slug: 'painter', name_en: 'Painter', name_hi: 'पेंटर', icon: 'paint', daily_rate: 900, hourly_rate: 200, sort: 6 },
  { slug: 'plumber', name_en: 'Plumber', name_hi: 'प्लंबर', icon: 'wrench', daily_rate: 900, hourly_rate: 250, sort: 7 },
  { slug: 'electrician', name_en: 'Electrician', name_hi: 'इलेक्ट्रीशियन', icon: 'zap', daily_rate: 1000, hourly_rate: 250, sort: 8 },
];

export type Person = { phone: string; name: string; role: 'admin' | 'customer' | 'worker'; lang?: 'en' | 'hi' };
export const admin: Person = { phone: '919999900000', name: 'DiNaDeNa Admin', role: 'admin' };
export const customers: Person[] = [
  { phone: '919999900001', name: 'Amit Sharma', role: 'customer' },
  { phone: '919999900002', name: 'Priya Verma', role: 'customer' },
  { phone: '919999900003', name: 'Rohit Gupta', role: 'customer', lang: 'hi' },
];

export type WorkerSeed = Person & {
  cats: string[]; area: string; lat: number; lng: number; exp: number; rating: number; count: number;
  jobs: number; status: 'approved' | 'pending'; available: boolean; bio: string; upi: string;
};
const w = (i: number, name: string, cats: string[], area: string, lat: number, lng: number, exp: number,
           rating: number, count: number, status: 'approved' | 'pending' = 'approved', available = true): WorkerSeed => ({
  phone: `9199999100${String(i).padStart(2, '0')}`, name, role: 'worker', cats, area, lat, lng, exp, rating, count,
  jobs: count + Math.round(count * 0.15), status, available,
  bio: `${exp} years of experience in ${cats.join(', ')} work around ${area}.`,
  upi: `${name.split(' ')[0].toLowerCase()}${i}@upi`,
});
export const workers: WorkerSeed[] = [
  w(1, 'Ramesh Yadav', ['loading', 'furniture', 'helper'], 'Transport Nagar', 26.8990, 75.8390, 5, 4.8, 320),
  w(2, 'Sohan Kumar', ['loading', 'helper'], 'Sodala', 26.9006, 75.7710, 3, 4.6, 180),
  w(3, 'Mahesh Meena', ['loading', 'furniture'], 'Raja Park', 26.8967, 75.8278, 4, 4.5, 95),
  w(4, 'Suresh Saini', ['mason', 'helper'], 'Mansarovar', 26.8505, 75.7628, 9, 4.9, 410),
  w(5, 'Raju Prajapat', ['mason'], 'Jhotwara', 26.9535, 75.7400, 6, 4.4, 150),
  w(6, 'Dinesh Kumawat', ['painter'], 'Malviya Nagar', 26.8549, 75.8243, 7, 4.7, 260),
  w(7, 'Mukesh Sharma', ['painter', 'cleaning'], 'Vaishali Nagar', 26.9115, 75.7425, 2, 4.3, 60),
  w(8, 'Vikram Singh', ['plumber'], 'C-Scheme', 26.9050, 75.8040, 8, 4.8, 290),
  w(9, 'Arjun Jangid', ['plumber', 'helper'], 'Shyam Nagar', 26.8930, 75.7600, 3, 4.2, 70),
  w(10, 'Imran Khan', ['electrician'], 'Bani Park', 26.9260, 75.7930, 10, 4.9, 380),
  w(11, 'Sunita Devi', ['cleaning'], 'Adarsh Nagar', 26.9020, 75.8250, 4, 4.7, 140),
  w(12, 'Kailash Bairwa', ['electrician', 'helper'], 'Tonk Road', 26.8700, 75.8000, 5, 4.5, 120, 'approved', false),
  w(13, 'Pappu Ram', ['loading', 'helper'], 'Transport Nagar', 26.8970, 75.8350, 1, 0, 0, 'pending', false),
  w(14, 'Gopal Nath', ['painter'], 'Sanganer', 26.8240, 75.7900, 2, 0, 0, 'pending', false),
];
