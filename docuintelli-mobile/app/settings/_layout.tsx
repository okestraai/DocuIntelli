import { Stack } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { goBack } from '../../src/utils/navigation';
import { colors } from '../../src/theme/colors';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.white },
        headerTintColor: colors.slate[900],
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.slate[50] },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => goBack('/(tabs)/settings')}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.slate[700]} strokeWidth={2} />
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="profile" options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="security" options={{ title: 'Security' }} />
      <Stack.Screen name="preferences" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
