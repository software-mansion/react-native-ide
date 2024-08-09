import { useState } from 'react';
import { View, Text, Button } from 'react-native';
import * as Location from 'expo-location';

export default function LocationScreen() {
  const [location, setLocation] = useState(null);

  async function readLocation() {
    let { status } = await Location.requestForegroundPermissionsAsync();
    console.log('Permission status', status);
    if (status !== 'granted') {
      setLocation('Permission to access location was denied');
      return;
    }

    const location = await Location.getCurrentPositionAsync({});
    console.log('Location', location);
    const { coords, timestamp } = location;
    const { latitude, longitude } = coords;
    setLocation(
      `${latitude.toFixed(4)}, ${longitude.toFixed(4)} at: ${new Date(
        timestamp
      ).toLocaleTimeString()}`
    );
  }

  return (
    <View>
      <Button title="Read current location" onPress={readLocation} />
      <Text style={{ textAlign: 'center' }}>{location}</Text>
    </View>
  );
}
