import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  /** Default order amount in INR (integer) for create-order when body omits amount */
  razorpayDefaultAmountInr: Number(process.env.RAZORPAY_DEFAULT_AMOUNT_INR) || 99,

  // Cloudinary — PDF storage. The SDK tolerates missing credentials at
  // boot (we only warn) so a dev without an account can still run the
  // rest of the app; the upload endpoint itself will 500 until set.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  pdfMaxSizeMb: Number(process.env.PDF_MAX_SIZE_MB) || 25,
};

export const isProd = env.nodeEnv === 'production';
