export type Role = 'customer' | 'worker' | 'admin';
export type Lang = 'en' | 'hi';
export type WorkerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type JobStatus = 'open' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus =
  | 'requested' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
  | 'on_the_way' | 'in_progress' | 'completed';
export type PaymentStatus = 'created' | 'success' | 'failed' | 'refunded';
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export type Profile = {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  language: Lang;
  avatar_url: string | null;
  city: string | null;
  onboarded: boolean;
  created_at: string;
};

export type PublicProfile = Pick<Profile, 'id' | 'role' | 'full_name' | 'avatar_url'>;

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_hi: string;
  icon: string;
  daily_rate: number;
  hourly_rate: number;
  active: boolean;
  sort: number;
};

export type WorkerProfile = {
  user_id: string;
  category_ids: string[];
  bio: string | null;
  experience_years: number;
  home_area: string | null;
  status: WorkerStatus;
  verified: boolean;
  available: boolean;
  daily_rate: number | null;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  rejection_reason: string | null;
  created_at: string;
};

export type WorkerPrivate = {
  user_id: string;
  home_lat: number | null;
  home_lng: number | null;
  id_doc_type: string | null;
  id_doc_path: string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
  upi_id: string | null;
};

export type WorkerCard = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  category_ids: string[];
  bio: string | null;
  experience_years: number;
  home_area: string | null;
  available: boolean;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  daily_rate: number;
  distance_km: number;
};

export type Job = {
  id: string;
  code: string;
  customer_id: string;
  category_id: string;
  job_type: 'quick' | 'daily';
  title: string;
  description: string | null;
  address: string;
  area: string | null;
  lat: number;
  lng: number;
  start_at: string;
  duration_minutes: number;
  workers_needed: number;
  rate_per_worker: number;
  platform_fee: number;
  photo_url: string | null;
  status: JobStatus;
  created_at: string;
};

export type NearbyJob = Pick<Job,
  'id' | 'code' | 'title' | 'description' | 'category_id' | 'area' | 'address' | 'lat' | 'lng' | 'start_at' |
  'duration_minutes' | 'workers_needed' | 'rate_per_worker' | 'photo_url' | 'created_at'> & {
  slots_filled: number;
  customer_name: string | null;
  distance_km: number;
};

export type Booking = {
  id: string;
  job_id: string;
  customer_id: string;
  worker_id: string;
  status: BookingStatus;
  amount: number;
  platform_fee: number;
  expires_at: string | null;
  responded_at: string | null;
  on_the_way_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  extra_minutes_requested: number;
  extra_minutes_approved: number;
  created_at: string;
};

export type Payment = {
  id: string;
  job_id: string;
  booking_id: string;
  customer_id: string;
  gateway: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  method: string;
  amount: number;
  status: PaymentStatus;
  created_at: string;
};

export type Review = {
  id: string;
  booking_id: string;
  from_user: string;
  to_user: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export type Complaint = {
  id: string;
  code: string;
  job_id: string | null;
  booking_id: string | null;
  raised_by: string;
  topic: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: ComplaintStatus;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  booking_id: string | null;
  created_at: string;
};

export type WorkerLocation = {
  id: string;
  booking_id: string;
  worker_id: string;
  lat: number;
  lng: number;
  recorded_at: string;
};

export type Settings = {
  platform_fee_per_worker: number;
  request_timeout_minutes: number;
  search_radius_km: number;
};

export type Quote = {
  rate_per_worker: number;
  platform_fee: number;
  labour_total: number;
  fee_total: number;
  total: number;
};
