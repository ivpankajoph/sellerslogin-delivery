declare namespace google {
  namespace maps {
    interface GeocoderAddressComponent {
      long_name: string;
      short_name: string;
      types: string[];
    }
    namespace places {
      interface PlaceResult {
        name?: string;
        address_components?: GeocoderAddressComponent[];
        formatted_address?: string;
        geometry?: {
          location?: {
            lat: () => number;
            lng: () => number;
          };
        };
        [key: string]: any;
      }
      class Autocomplete {
        constructor(input: HTMLInputElement, options?: Record<string, unknown>);
        addListener(eventName: string, handler: () => void): void;
        getPlace(): PlaceResult;
      }
    }
  }
}

interface Window {
  google?: {
    maps: {
      places: {
        Autocomplete: typeof google.maps.places.Autocomplete;
      };
    };
  };
}
