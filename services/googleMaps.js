import axios from "axios";

class GoogleMapsService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.client = axios.create({
      baseURL: "https://maps.googleapis.com/maps/api",
    });
  }

  async getDistance(origin, destination) {
    try {
      const response = await this.client.get("/distancematrix/json", {
        params: {
          origins: `${origin.lat},${origin.lng}`,
          destinations: `${destination.lat},${destination.lng}`,
          key: this.apiKey,
        },
      });

      if (response.data.status === "OK") {
        const element = response.data.rows[0].elements[0];
        if (element.status === "OK") {
          return {
            distance: element.distance.value / 1000, // Convert to km
            duration: element.duration.value, // In seconds
          };
        }
      }

      throw new Error("Failed to calculate distance");
    } catch (error) {
      console.error("Google Maps API error:", error);
      throw error;
    }
  }

  async geocodeAddress(address) {
    try {
      const response = await this.client.get("/geocode/json", {
        params: {
          address: address,
          key: this.apiKey,
        },
      });

      if (response.data.status === "OK") {
        const location = response.data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng,
          address: response.data.results[0].formatted_address,
        };
      }

      throw new Error("Failed to geocode address");
    } catch (error) {
      console.error("Geocoding error:", error);
      throw error;
    }
  }
}

export const googleMapsService = new GoogleMapsService();
