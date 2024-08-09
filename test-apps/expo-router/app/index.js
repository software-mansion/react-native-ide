import React, { useState, useEffect, useRef, useContext } from 'react';
import { Button, TextInput, View, Text, useColorScheme } from 'react-native';
import { Link } from 'expo-router';
import { NiceButton } from './components/NiceButton';
import { UglyButton } from './components/UglyButton';

const obj = {
  something: 'lsdkjfhjdshf',
  arrayOfThings: [
    {
      number: 1,
      string: 'sdjfh',
      andObject: {
        prop1: 77,
        prop2: 2837,
      },
    },
    {
      number: 2,
      string: 'skdfh',
      andObject: {
        prop1: 919,
        prop2: 22,
      },
    },
  ],
};

function two(uu) {
  let b = 2;
  for (let i = 0; i < 10; i++) {
    b += i;
  }
  console.log('P', uu.a + b);
}

function one() {
  let g = 7;
  for (let i = 0; i < 10; i++) {
    g += i;
  }
  const uu = Object.assign({ g }, obj);
  two(uu);
}

export default function Home() {
  const ref = useRef(null);
  const appearance = useColorScheme();

  return (
    <View
      ref={ref}
      style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Link href="/details">Go to details</Link>
      <Link href="/another">another</Link>
      <Link href="/location">test location</Link>
      <Link href="/another?id=100">/another?id=100</Link>
      <NiceButton
        onPress={() => {
          let a = 2;
          console.log('Nice button pressed', obj);
          one();
          a++;
          console.warn('Yollo');
          console.warn('Yollo3');
          // console.warn('Nice button pressed again');
          // console.log('WWW', window.__REACT_DEVTOOLS_PORT__);
        }}
      />
      <TextInput
        style={{
          height: 40,
          borderColor: 'gray',
          borderWidth: 1,
          width: '70%',
        }}
      />
      <Button
        title="Throw error 1"
        onPress={() => {
          throw new Error('from button');
        }}
      />
      <UglyButton />
      <Text>Appearance: {appearance}</Text>
    </View>
  );
}
