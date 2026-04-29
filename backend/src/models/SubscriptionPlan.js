import mongoose from 'mongoose';

const PLAN_TYPES = ['monthly', 'quarterly', 'yearly', 'lifetime'];

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    planType: { type: String, enum: PLAN_TYPES, required: true, unique: true, index: true },
    durationDays: { type: Number, default: null, min: 1 },
    priceInr: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 100, index: true },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

subscriptionPlanSchema.pre('validate', function validateDuration(next) {
  if (this.planType === 'lifetime') {
    this.durationDays = null;
    return next();
  }
  if (!Number.isInteger(this.durationDays) || this.durationDays <= 0) {
    return next(new Error('durationDays must be a positive integer for non-lifetime plans'));
  }
  return next();
});

subscriptionPlanSchema.index({ isActive: 1, displayOrder: 1 });

export const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
