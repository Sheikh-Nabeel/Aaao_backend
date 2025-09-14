class PricingService {
  constructor() {
    this.baseFares = {
      carRecovery: 2.5,
      recoveryCrane: 5.0,
    };

    this.perKmRates = {
      carRecovery: 1.5,
      recoveryCrane: 2.5,
    };

    this.perMinuteRates = {
      carRecovery: 0.2,
      recoveryCrane: 0.4,
    };
  }

  calculatePrice(category, distance, duration, roundTrip = false) {
    const baseFare = this.baseFares[category];
    const distanceFare = distance * this.perKmRates[category];
    const timeFare = (duration / 60) * this.perMinuteRates[category];

    const totalFare = baseFare + distanceFare + timeFare;
    return roundTrip ? totalFare * 2 : totalFare;
  }
}

export const pricingService = new PricingService();
