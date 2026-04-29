import { subscriptionPlanRepository } from '../repositories/subscriptionPlanRepository.js';

const DEFAULT_PLANS = [
  {
    name: 'Monthly',
    planType: 'monthly',
    durationDays: 30,
    priceInr: 99,
    isActive: true,
    displayOrder: 1,
    description: 'Best to get started',
  },
  {
    name: 'Quarterly',
    planType: 'quarterly',
    durationDays: 90,
    priceInr: 199,
    isActive: true,
    displayOrder: 2,
    description: 'More value per month',
  },
  {
    name: 'Yearly',
    planType: 'yearly',
    durationDays: 365,
    priceInr: 499,
    isActive: true,
    displayOrder: 3,
    description: 'Best value for consistent prep',
  },
  {
    name: 'Lifetime',
    planType: 'lifetime',
    durationDays: null,
    priceInr: 999,
    isActive: true,
    displayOrder: 4,
    description: 'One-time purchase for lifetime premium access',
  },
];

let ensured = false;

export const subscriptionPlanService = {
  async ensureSeededDefaults() {
    if (ensured) return;
    const count = await subscriptionPlanRepository.countAll();
    if (count === 0) {
      await subscriptionPlanRepository.insertMany(DEFAULT_PLANS);
    }
    ensured = true;
  },

  async listActivePlans() {
    await this.ensureSeededDefaults();
    return subscriptionPlanRepository.findActiveSorted();
  },

  async getActivePlanById(planId) {
    await this.ensureSeededDefaults();
    const plan = await subscriptionPlanRepository.findById(planId);
    if (!plan || plan.isActive !== true) return null;
    return plan;
  },
};
