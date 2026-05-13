/**
 * Session Reset Time Calculators
 */

export interface IResetCalculator {
  /**
   * Calculate next reset time from hit time
   */
  calculateResetTime(hitTime: Date): Date;
}

export class DailyResetCalculator implements IResetCalculator {
  calculateResetTime(_hitTime: Date): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}

export class MonthlyResetCalculator implements IResetCalculator {
  calculateResetTime(_hitTime: Date): Date {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    return nextMonth;
  }
}

export class CustomResetCalculator implements IResetCalculator {
  constructor(private readonly calculator: (hitTime: Date) => Date) {}

  calculateResetTime(hitTime: Date): Date {
    return this.calculator(hitTime);
  }
}
