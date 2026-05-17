import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { brand } from '../../theme/colors';
import {
  getSplashLogoSize,
  SPLASH_TIMING,
  SPLASH_WORDS,
  splashTheme,
} from '../../theme/splash';

const EASE_OUT = Easing.out(Easing.cubic);
const WORD_MOTION_Y = 8;

function AnimatedMottoWord({ word, anim, isLast }) {
  return (
    <Animated.Text
      style={[
        styles.word,
        isLast && styles.wordLast,
        {
          opacity: anim.opacity,
          transform: [{ translateY: anim.translateY }],
        },
      ]}
    >
      {word}
    </Animated.Text>
  );
}

/**
 * Visual-only: logo → motto words. Does not read auth state.
 */
export default function BrandSplashAnimation({ onSequenceComplete }) {
  const { width, height } = useWindowDimensions();
  const logoSize = getSplashLogoSize(width, height);
  const completedRef = useRef(false);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoTranslateY = useRef(new Animated.Value(WORD_MOTION_Y)).current;

  const wordAnims = useRef(
    SPLASH_WORDS.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(WORD_MOTION_Y),
    }))
  ).current;

  const dotAnims = useRef(
    SPLASH_WORDS.slice(1).map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const logoAnim = Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: SPLASH_TIMING.logoDuration,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: SPLASH_TIMING.logoDuration,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(logoTranslateY, {
        toValue: 0,
        duration: SPLASH_TIMING.logoDuration,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]);

    const wordAnimations = SPLASH_WORDS.map((_, index) => {
      const { opacity, translateY } = wordAnims[index];
      const delay = SPLASH_TIMING.wordStartDelay + index * SPLASH_TIMING.wordStagger;
      const fadeIn = [
        Animated.timing(opacity, {
          toValue: 1,
          duration: SPLASH_TIMING.wordDuration,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: SPLASH_TIMING.wordDuration,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ];
      if (index > 0) {
        fadeIn.push(
          Animated.timing(dotAnims[index - 1], {
            toValue: 1,
            duration: SPLASH_TIMING.wordDuration * 0.9,
            easing: EASE_OUT,
            useNativeDriver: true,
          })
        );
      }
      return Animated.sequence([Animated.delay(delay), Animated.parallel(fadeIn)]);
    });

    const lastWordEnd =
      SPLASH_TIMING.wordStartDelay +
      (SPLASH_WORDS.length - 1) * SPLASH_TIMING.wordStagger +
      SPLASH_TIMING.wordDuration;

    const completeTimer = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onSequenceComplete?.();
    }, lastWordEnd + SPLASH_TIMING.sequenceEndPadding);

    Animated.sequence([logoAnim, Animated.parallel(wordAnimations)]).start();

    return () => clearTimeout(completeTimer);
  }, [logoOpacity, logoScale, logoTranslateY, onSequenceComplete, wordAnims, dotAnims]);

  return (
    <View style={styles.block}>
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }, { translateY: logoTranslateY }],
        }}
      >
        <Image
          source={require('../../../assets/icon.png')}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={`${brand.name} logo`}
        />
        <Text style={styles.brandName}>{brand.name}</Text>
      </Animated.View>

      <View style={styles.mottoRow}>
        {SPLASH_WORDS.map((word, index) => (
          <View key={word} style={styles.mottoSegment}>
            {index > 0 ? (
              <Animated.Text style={[styles.dot, { opacity: dotAnims[index - 1] }]}>
                {' • '}
              </Animated.Text>
            ) : null}
            <AnimatedMottoWord
              word={word}
              anim={wordAnims[index]}
              isLast={index === SPLASH_WORDS.length - 1}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    maxWidth: 360,
  },
  brandName: {
    marginTop: 16,
    fontSize: 32,
    fontWeight: '800',
    color: splashTheme.brandName,
    letterSpacing: 3,
    textAlign: 'center',
  },
  mottoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    minHeight: 24,
    paddingHorizontal: 8,
  },
  mottoSegment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontSize: 14,
    fontWeight: '600',
    color: splashTheme.word,
    letterSpacing: 0.35,
  },
  wordLast: {
    color: splashTheme.wordEmphasis,
    fontWeight: '700',
  },
  dot: {
    fontSize: 14,
    fontWeight: '700',
    color: splashTheme.accent,
  },
});
