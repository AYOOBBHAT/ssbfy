import { Image, Text, View } from 'react-native';
import { brand } from '../../theme/colors';
import { authMottoDot, authStyles } from '../../theme/authUi';

/**
 * Compact in-content branding for Login / Signup (no duplicate stack title).
 */
export default function AuthBrandHeader({ subtitle }) {
  return (
    <View style={authStyles.brandBlock}>
      <Image
        source={require('../../../assets/icon.png')}
        style={authStyles.logo}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={`${brand.name} logo`}
      />
      <Text style={authStyles.brandName}>{brand.name}</Text>
      <View style={authStyles.mottoRow}>
        <Text style={authStyles.mottoPart}>Prepare</Text>
        <Text style={authStyles.mottoDot}> • </Text>
        <Text style={authStyles.mottoPart}>Practice</Text>
        <Text style={authStyles.mottoDot}> • </Text>
        <Text style={authStyles.mottoPart}>Succeed</Text>
      </View>
      {subtitle ? <Text style={authStyles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}
