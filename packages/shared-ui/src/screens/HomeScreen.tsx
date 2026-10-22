import { StyleSheet, View, Image, Text, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { DrawerActions, useIsFocused } from '@react-navigation/native';
import { useMenuContext } from '../components/MenuContext';
import {
  SpatialNavigationFocusableView,
  SpatialNavigationRoot,
  SpatialNavigationScrollView,
  SpatialNavigationNode,
  SpatialNavigationVirtualizedList,
  DefaultFocus,
} from 'react-tv-space-navigation';
import { Direction } from '@bam.tech/lrud';
import { scaledPixels } from '../hooks/useScale';
import { RootStackParamList } from '../navigation/types';
import { fetchMoviesData, groupByCategory, CardData } from '../data/moviesData';
import { colors, safeZones } from '../theme';
import PlatformLinearGradient from '../components/PlatformLinearGradient';
import { getOpenDrawerDirection } from '../utils/rtl';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DrawerNavigator'>;

// Memoized MovieItem component to prevent unnecessary re-renders and optimize image source
const MovieItem = React.memo(
  ({
    item,
    isFocused,
    styles,
  }: {
    item: CardData;
    isFocused: boolean;
    styles: any;
  }) => {
    const imageSource = useMemo(() => ({ uri: item.headerImage }), [item.headerImage]);
    // Spring on transform only: runs on the native driver, cheap even on Fire TV Stick GPUs
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
      Animated.spring(scale, { toValue: isFocused ? 1.08 : 1, friction: 7, tension: 90, useNativeDriver: true }).start();
    }, [isFocused, scale]);

    return (
      <Animated.View
        style={[styles.highlightThumbnail, isFocused && styles.highlightThumbnailFocused, { transform: [{ scale }] }]}
      >
        <Image
          source={imageSource}
          style={styles.cardImage}
          resizeMode="cover"
          onError={(error) => console.log('Image load error:', item.title, error.nativeEvent.error)}
          onLoad={() => console.log('Image loaded:', item.title)}
        />
        <View style={styles.thumbnailTextContainer}>
          <Text style={styles.thumbnailText} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
      </Animated.View>
    );
  },
);

const FADE_STEPS = Array.from({ length: 14 }, (_, i) => (i + 1) / 14);

const formatDuration = (sec?: number) => {
  if (!sec) return '';
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${Math.max(min, 1)} min`;
};

// Pulsing placeholders shaped like the real hero and row while the catalog loads
const LoadingSkeleton = () => {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={gridStyles.container}>
      <Animated.View style={[gridStyles.header, gridStyles.skeletonBlock, { opacity: pulse }]} />
      <View style={[gridStyles.highlightsContainer, gridStyles.skeletonRow]}>
        {[0, 1, 2, 3].map(i => (
          <Animated.View key={i} style={[gridStyles.highlightThumbnail, gridStyles.skeletonBlock, { opacity: pulse }]} />
        ))}
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { isOpen: isMenuOpen, toggleMenu } = useMenuContext();
  // Rows hold different items, so track the focused item itself (index is only its position in its row)
  const [focused, setFocused] = useState<{ item: CardData | null; index: number }>({ item: null, index: 0 });
  const [moviesData, setMoviesData] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const heroFade = useRef(new Animated.Value(1)).current;
  const isFocused = useIsFocused();
  const isActive = isFocused && !isMenuOpen;

  // Fetch movies from catalog on mount
  useEffect(() => {
    const loadMovies = async () => {
      try {
        setIsLoading(true);
        const movies = await fetchMoviesData();
        console.log('Fetched movies:', movies.length);
        console.log('First movie:', movies[0]);
        setMoviesData(movies);
      } catch (error) {
        console.error('Failed to load movies:', error);
        setLoadFailed(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadMovies();
  }, []);

  const focusedItem = focused.item ?? moviesData[0] ?? null;
  const rows = useMemo(() => groupByCategory(moviesData), [moviesData]);

  // Dissolve the hero and slide its glass panel in whenever focus moves to another video
  useEffect(() => {
    heroFade.setValue(0);
    Animated.timing(heroFade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [focusedItem?.id, heroFade]);

  // Memoize header image source to prevent unnecessary re-renders
  const headerImageSource = useMemo(
    () => (focusedItem ? { uri: focusedItem.headerImage } : undefined),
    [focusedItem?.headerImage],
  );

  const renderHeader = useCallback(
    () => {
      if (!focusedItem) return null;
      const meta = [formatDuration(focusedItem.duration), focusedItem.contentRating].filter(Boolean).join('  ·  ');

      return (
        <View style={gridStyles.header}>
          <Animated.Image
            style={[gridStyles.headerImage, { opacity: heroFade.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}
            source={headerImageSource}
            resizeMode="cover"
          />
          {/* Linear gradient scrim for left overlay */}
          <PlatformLinearGradient
            colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={gridStyles.gradientLeft}
          />
          {/* Bottom fade so the hero melts into the rows. PlatformLinearGradient is a solid-color stub,
              so stacked bands of rising opacity draw the fade on every platform (Vega, Fire OS, web). */}
          <View style={gridStyles.gradientBottom} pointerEvents="none">
            {FADE_STEPS.map(opacity => (
              <View key={opacity} style={[gridStyles.fadeBand, { opacity }]} />
            ))}
          </View>
          <Animated.View
            style={[
              gridStyles.headerTextContainer,
              {
                opacity: heroFade,
                transform: [{ translateY: heroFade.interpolate({ inputRange: [0, 1], outputRange: [scaledPixels(28), 0] }) }],
              },
            ]}
          >
            <View style={gridStyles.glassPanel}>
              <View style={gridStyles.metaRow}>
                {!!focusedItem.category && (
                  <View style={gridStyles.categoryChip}>
                    <Text style={gridStyles.categoryChipText}>{focusedItem.category}</Text>
                  </View>
                )}
                {!!meta && <Text style={gridStyles.metaText}>{meta}</Text>}
              </View>
              <Text style={gridStyles.headerTitle} numberOfLines={2}>
                {focusedItem.title}
              </Text>
              <Text style={gridStyles.headerDescription} numberOfLines={3}>
                {focusedItem.description}
              </Text>
            </View>
          </Animated.View>
        </View>
      );
    },
    [headerImageSource, focusedItem, heroFade],
  );

  const onDirectionHandledWithoutMovement = useCallback(
    (movement: Direction) => {
      if (movement === getOpenDrawerDirection() && focused.index === 0) {
        navigation.dispatch(DrawerActions.openDrawer());
        toggleMenu(true);
      }
    },
    [toggleMenu, focused.index, navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: CardData; index: number }) => (
      <SpatialNavigationFocusableView
        onSelect={() => {
          navigation.navigate('Details', {
            title: item.title,
            description: item.description,
            headerImage: item.headerImage,
            movie: item.movie,
            category: item.category,
            genres: item.genres,
            releaseYear: item.releaseYear,
            rating: item.rating,
            ratingCount: item.ratingCount,
            contentRating: item.contentRating,
            duration: item.duration,
          });
        }}
        onFocus={() => setFocused({ item, index })}
      >
        {({ isFocused }) => <MovieItem item={item} isFocused={isFocused} styles={gridStyles} />}
      </SpatialNavigationFocusableView>
    ),
    [navigation],
  );

  const renderScrollableRow = useCallback(
    (title: string, data: CardData[]) => {
      return (
        <View key={title} style={gridStyles.highlightsContainer}>
          <View style={gridStyles.rowTitleWrap}>
            <View style={gridStyles.rowAccent} />
            <Text style={gridStyles.highlightsTitle}>{title}</Text>
          </View>
          <SpatialNavigationNode>
            <DefaultFocus>
              <SpatialNavigationVirtualizedList
                data={data}
                orientation="horizontal"
                renderItem={renderItem}
                itemSize={scaledPixels(440)}
                onEndReachedThresholdItemsNumber={3}
              />
            </DefaultFocus>
          </SpatialNavigationNode>
        </View>
      );
    },
    [renderItem],
  );

  if (isLoading) return <LoadingSkeleton />;

  if (moviesData.length === 0) {
    return (
      <View style={[gridStyles.container, gridStyles.centered]}>
        <View style={gridStyles.glassPanel}>
          <Text style={gridStyles.headerTitle}>{loadFailed ? "Couldn't load this channel" : 'No videos yet'}</Text>
          <Text style={gridStyles.headerDescription}>
            {loadFailed ? 'Check your internet connection and open the app again.' : 'New videos will show up here soon.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SpatialNavigationRoot isActive={isActive} onDirectionHandledWithoutMovement={onDirectionHandledWithoutMovement}>
      <View style={gridStyles.container}>
        {renderHeader()}
        <SpatialNavigationScrollView offsetFromStart={scaledPixels(60)} style={gridStyles.scrollContent}>
          {rows.map(row => renderScrollableRow(row.title, row.items))}
        </SpatialNavigationScrollView>
      </View>
    </SpatialNavigationRoot>
  );
}

const gridStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flex: 1,
    marginBottom: scaledPixels(safeZones.actionSafe.vertical),
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaledPixels(16),
    marginTop: scaledPixels(20),
  },
  rowAccent: {
    width: scaledPixels(8),
    height: scaledPixels(36),
    borderRadius: scaledPixels(4),
    backgroundColor: colors.primary,
    marginEnd: scaledPixels(16),
  },
  glassPanel: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderWidth: scaledPixels(2),
    borderRadius: scaledPixels(28),
    paddingHorizontal: scaledPixels(40),
    paddingVertical: scaledPixels(32),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaledPixels(16),
  },
  categoryChip: {
    backgroundColor: colors.primary,
    borderRadius: scaledPixels(40),
    paddingHorizontal: scaledPixels(18),
    paddingVertical: scaledPixels(6),
    marginEnd: scaledPixels(18),
  },
  categoryChipText: {
    color: '#FFFFFF',
    fontSize: scaledPixels(22),
    fontWeight: '700',
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: scaledPixels(22),
    fontWeight: '600',
  },
  gradientBottom: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: '45%',
  },
  fadeBand: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skeletonBlock: {
    backgroundColor: colors.cardElevated,
  },
  skeletonRow: {
    flexDirection: 'row',
    marginTop: scaledPixels(60),
  },
  highlightsTitle: {
    color: colors.text,
    fontSize: scaledPixels(40),
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerTitle: {
    color: colors.text,
    fontSize: scaledPixels(56),
    fontWeight: 'bold',
    marginBottom: scaledPixels(16),
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  headerDescription: {
    color: colors.text,
    fontSize: scaledPixels(28),
    fontWeight: '500',
    lineHeight: scaledPixels(40),
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  thumbnailTextContainer: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: colors.glassStrong,
    borderTopWidth: scaledPixels(1),
    borderTopColor: colors.glassBorder,
    paddingHorizontal: scaledPixels(16),
    paddingVertical: scaledPixels(12),
  },
  thumbnailText: {
    color: colors.text,
    fontSize: scaledPixels(24),
    fontWeight: '600',
    lineHeight: scaledPixels(32),
  },
  highlightThumbnail: {
    width: scaledPixels(420),
    height: scaledPixels(260),
    marginEnd: scaledPixels(20),
    backgroundColor: colors.card,
    borderRadius: scaledPixels(12),
    borderWidth: scaledPixels(5),
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  highlightThumbnailFocused: {
    borderColor: colors.primary,
    borderWidth: scaledPixels(6),
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: scaledPixels(20),
    elevation: 15,
  },
  highlightsContainer: {
    paddingHorizontal: scaledPixels(safeZones.actionSafe.horizontal),
    paddingVertical: scaledPixels(16),
    height: scaledPixels(400),
  },
  thumbnailPlaceholder: {
    backgroundColor: colors.cardElevated,
    width: '100%',
    height: '100%',
    borderRadius: scaledPixels(8),
  },
  header: {
    width: '100%',
    height: scaledPixels(700),
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  gradientLeft: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    width: '65%',
  },
  headerTextContainer: {
    position: 'absolute',
    start: scaledPixels(safeZones.titleSafe.horizontal),
    top: scaledPixels(safeZones.titleSafe.vertical),
    bottom: scaledPixels(safeZones.titleSafe.vertical),
    justifyContent: 'center',
    width: '55%',
  },
  highlightsList: {
    paddingStart: scaledPixels(20),
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: scaledPixels(8),
  },
});
