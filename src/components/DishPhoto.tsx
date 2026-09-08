import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { type Dish } from '../types';
import { resolveDishPhoto } from '../../shared/dishPhotos';
import { resolveReferencePhoto } from '../../shared/referencePhoto';
import { API_URL } from '../lib/api';
import { dishPhotoAssets } from '../lib/dishPhotoAssets';
import { colors, fonts } from '../theme';
import { useT } from '../lib/i18n';

// Photos and their attribution travel together, including for saved menus.
// Old API search URLs are deliberately never used as a fallback.
export default function DishPhoto({ dish, style, hideWhenMissing = false }: {
  dish: Dish; style?: StyleProp<ViewStyle>; hideWhenMissing?: boolean;
}) {
  const t = useT();
  const photo = resolveReferencePhoto(dish) || resolveDishPhoto(dish);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const source = photo ? ('deliveryPath' in photo ? {uri: API_URL + photo.deliveryPath} : dishPhotoAssets[photo.id]) : null;
  const available = photo && source && failedId !== photo.id;
  if (!available && hideWhenMissing) return null;
  return <View style={[styles.frame, style]}>
    {available ? <>
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover"
        accessibilityLabel={`${photo.name} — ${t('representativePhoto')}`}
        onError={() => setFailedId(photo.id)} />
      <Pressable style={styles.credit} accessibilityRole="button"
        accessibilityLabel={`${t('photoCredit')}: ${photo.author}`}
        onPress={event => { event.stopPropagation(); setExpanded(true); }}>
        <Text style={styles.creditText} numberOfLines={1}>{photo.author} · ⓘ</Text>
      </Pressable>
      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Pressable onPress={() => setExpanded(false)} style={styles.close} accessibilityRole="button" accessibilityLabel={t('done')}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <ScrollView contentContainerStyle={styles.content}>
              <Image source={source} style={styles.fullImage} resizeMode="contain" />
              <Text style={styles.eyebrow}>{t('representativePhoto')}</Text>
              <Text style={styles.title}>{photo.name}</Text>
              <Text style={styles.note}>{t('representativePhotoNote')}</Text>
              <Text style={styles.author}>{t('photoCredit')}: {photo.author}</Text>
              <Text style={styles.note}>{photo.title}</Text>
              <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(photo.sourceUrl).catch(() => {}); }}>
                <Text style={styles.link}>{t('viewOriginalPhoto')} ↗</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(photo.licenseUrl).catch(() => {}); }}>
                <Text style={styles.link}>{photo.license} ↗</Text>
              </Pressable>
              <Text style={styles.note}>{t('photoCropNote')}</Text>
              <Text style={styles.note}>Wikimedia Commons</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </> : <View style={styles.placeholder} accessibilityLabel={t('photoNotAvailable')}>
      <Text style={styles.glyph}>{dish.original_name?.trim().slice(0, 1).toUpperCase() || '·'}</Text>
    </View>}
  </View>;
}

// A shared screenshot must retain attribution without requiring a tap.
export function ExportPhotoCredit({ dish }: { dish: Dish }) {
  const photo = resolveReferencePhoto(dish) || resolveDishPhoto(dish);
  if (!photo) return null;
  return <Text style={styles.exportCredit}>
    {photo.title} · {photo.author} · {photo.license}{'\n'}
    {photo.licenseUrl}{'\n'}{photo.sourceUrl}{'\n'}
    Representative photo. Preview cropped to fit. Wikimedia Commons.
  </Text>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.background, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: fonts.display, fontSize: 48, color: colors.lineStrong },
  credit: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 6,
    paddingVertical: 5, minHeight: 24, backgroundColor: 'rgba(20,16,12,0.72)', justifyContent: 'center' },
  creditText: { fontFamily: fonts.body, color: '#fff', fontSize: 9 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(18,14,11,0.82)' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '90%', borderRadius: 22, backgroundColor: colors.surface, overflow: 'hidden' },
  content: { padding: 22, paddingTop: 46 },
  close: { position: 'absolute', top: 6, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  closeText: { fontSize: 30, color: colors.text },
  fullImage: { width: '100%', height: 270, backgroundColor: colors.background },
  eyebrow: { marginTop: 18, fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.accent },
  title: { marginTop: 6, fontFamily: fonts.display, fontSize: 30, color: colors.text },
  note: { marginTop: 8, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  author: { marginTop: 16, fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.text },
  link: { paddingVertical: 10, fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.accent },
  exportCredit: { padding: 10, fontSize: 9, lineHeight: 13, color: colors.muted },
});
