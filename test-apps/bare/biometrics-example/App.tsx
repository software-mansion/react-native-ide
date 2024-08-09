import React, { useEffect, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';

import {
  Colors,
} from 'react-native/Libraries/NewAppScreen';



function App(): React.JSX.Element {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [biometrics, setBiometrics] = useState(new ReactNativeBiometrics({allowDeviceCredentials: true}) );
  async function AuthSimplePrompt(){
    const { biometryType } = await biometrics.isSensorAvailable();
    console.log("isSensorAvailable", biometryType)
    try{
      const {success} = await biometrics.simplePrompt({
        promptMessage: 'Confirmation',
      });
      
      if (success) {
        setIsAuthorized(true);
      }
      else{
        setIsAuthorized(false);
      }
    }catch(e){
      setIsAuthorized(false);
      console.log("isSensorAvailable", e);
    }
   
  } 

  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <View
          style={{
            display: "flex",
            justifyContent:"center",
            alignItems: "center",
            height: 500,
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
          }}>
            <Button title = {"Try and Authorize"} onPress={AuthSimplePrompt}></Button>
            <View>
              {isAuthorized &&
                <Text>I am authorized!</Text>
              }
              {!isAuthorized &&
                <Text>I am NOT authorized!</Text>
              }
            </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
