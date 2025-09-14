import redis from "redis";

class RedisService {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    this.client.on("error", (err) => console.log("Redis Client Error", err));
    this.client.connect();
  }

  async setDriverLocation(driverId, lat, lng) {
    await this.client.geoAdd("drivers:locations", {
      longitude: lng,
      latitude: lat,
      member: driverId.toString(),
    });
  }

  async removeDriverLocation(driverId) {
    await this.client.zRem("drivers:locations", driverId.toString());
  }

  async getNearbyDrivers(lat, lng, radius = 5) {
    return await this.client.geoSearch(
      "drivers:locations",
      { longitude: lng, latitude: lat },
      { radius: radius, unit: "km" }
    );
  }

  async updateDriverStatus(driverId, isOnline) {
    if (isOnline) {
      // Driver status will be managed through the GEO commands
    } else {
      await this.removeDriverLocation(driverId);
    }
  }
}

export const redisService = new RedisService();
