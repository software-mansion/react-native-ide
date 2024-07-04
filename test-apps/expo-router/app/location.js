import { useState } from 'react';
import { View, Text, Button } from 'react-native';
import * as Location from 'expo-location';

export default function Another() {
  const [location, setLocation] = useState(null);

  async function readLocation() {
    let { status } = await Location.requestForegroundPermissionsAsync();
    console.log('Permission status', status);

    let location = await Location.getCurrentPositionAsync({});
    console.log('Location', location);
    setLocation(
      `${location.coords.latitude.toFixed(
        4
      )}, ${location.coords.longitude.toFixed(4)} at: ${new Date(
        location.timestamp
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
