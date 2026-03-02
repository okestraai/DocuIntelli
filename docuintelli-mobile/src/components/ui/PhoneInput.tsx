import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { ChevronDown, Search, X } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Country {
  code: string;   // e.g. "US"
  dial: string;   // e.g. "+1"
  flag: string;   // emoji flag
  name: string;
}

/** Generate emoji flag from ISO 3166-1 alpha-2 code */
function flagEmoji(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

const COUNTRIES: Country[] = [
  // North America
  { code: 'US', dial: '+1', flag: flagEmoji('US'), name: 'United States' },
  { code: 'CA', dial: '+1', flag: flagEmoji('CA'), name: 'Canada' },
  { code: 'MX', dial: '+52', flag: flagEmoji('MX'), name: 'Mexico' },
  // Caribbean
  { code: 'AG', dial: '+1268', flag: flagEmoji('AG'), name: 'Antigua & Barbuda' },
  { code: 'BS', dial: '+1242', flag: flagEmoji('BS'), name: 'Bahamas' },
  { code: 'BB', dial: '+1246', flag: flagEmoji('BB'), name: 'Barbados' },
  { code: 'BZ', dial: '+501', flag: flagEmoji('BZ'), name: 'Belize' },
  { code: 'CU', dial: '+53', flag: flagEmoji('CU'), name: 'Cuba' },
  { code: 'DM', dial: '+1767', flag: flagEmoji('DM'), name: 'Dominica' },
  { code: 'DO', dial: '+1809', flag: flagEmoji('DO'), name: 'Dominican Republic' },
  { code: 'GD', dial: '+1473', flag: flagEmoji('GD'), name: 'Grenada' },
  { code: 'HT', dial: '+509', flag: flagEmoji('HT'), name: 'Haiti' },
  { code: 'JM', dial: '+1876', flag: flagEmoji('JM'), name: 'Jamaica' },
  { code: 'KN', dial: '+1869', flag: flagEmoji('KN'), name: 'Saint Kitts & Nevis' },
  { code: 'LC', dial: '+1758', flag: flagEmoji('LC'), name: 'Saint Lucia' },
  { code: 'VC', dial: '+1784', flag: flagEmoji('VC'), name: 'Saint Vincent & Grenadines' },
  { code: 'TT', dial: '+1868', flag: flagEmoji('TT'), name: 'Trinidad & Tobago' },
  { code: 'PR', dial: '+1787', flag: flagEmoji('PR'), name: 'Puerto Rico' },
  { code: 'VI', dial: '+1340', flag: flagEmoji('VI'), name: 'U.S. Virgin Islands' },
  // Central America
  { code: 'CR', dial: '+506', flag: flagEmoji('CR'), name: 'Costa Rica' },
  { code: 'SV', dial: '+503', flag: flagEmoji('SV'), name: 'El Salvador' },
  { code: 'GT', dial: '+502', flag: flagEmoji('GT'), name: 'Guatemala' },
  { code: 'HN', dial: '+504', flag: flagEmoji('HN'), name: 'Honduras' },
  { code: 'NI', dial: '+505', flag: flagEmoji('NI'), name: 'Nicaragua' },
  { code: 'PA', dial: '+507', flag: flagEmoji('PA'), name: 'Panama' },
  // South America
  { code: 'AR', dial: '+54', flag: flagEmoji('AR'), name: 'Argentina' },
  { code: 'BO', dial: '+591', flag: flagEmoji('BO'), name: 'Bolivia' },
  { code: 'BR', dial: '+55', flag: flagEmoji('BR'), name: 'Brazil' },
  { code: 'CL', dial: '+56', flag: flagEmoji('CL'), name: 'Chile' },
  { code: 'CO', dial: '+57', flag: flagEmoji('CO'), name: 'Colombia' },
  { code: 'EC', dial: '+593', flag: flagEmoji('EC'), name: 'Ecuador' },
  { code: 'GY', dial: '+592', flag: flagEmoji('GY'), name: 'Guyana' },
  { code: 'PY', dial: '+595', flag: flagEmoji('PY'), name: 'Paraguay' },
  { code: 'PE', dial: '+51', flag: flagEmoji('PE'), name: 'Peru' },
  { code: 'SR', dial: '+597', flag: flagEmoji('SR'), name: 'Suriname' },
  { code: 'UY', dial: '+598', flag: flagEmoji('UY'), name: 'Uruguay' },
  { code: 'VE', dial: '+58', flag: flagEmoji('VE'), name: 'Venezuela' },
  // Western Europe
  { code: 'GB', dial: '+44', flag: flagEmoji('GB'), name: 'United Kingdom' },
  { code: 'IE', dial: '+353', flag: flagEmoji('IE'), name: 'Ireland' },
  { code: 'FR', dial: '+33', flag: flagEmoji('FR'), name: 'France' },
  { code: 'DE', dial: '+49', flag: flagEmoji('DE'), name: 'Germany' },
  { code: 'AT', dial: '+43', flag: flagEmoji('AT'), name: 'Austria' },
  { code: 'CH', dial: '+41', flag: flagEmoji('CH'), name: 'Switzerland' },
  { code: 'BE', dial: '+32', flag: flagEmoji('BE'), name: 'Belgium' },
  { code: 'NL', dial: '+31', flag: flagEmoji('NL'), name: 'Netherlands' },
  { code: 'LU', dial: '+352', flag: flagEmoji('LU'), name: 'Luxembourg' },
  { code: 'MC', dial: '+377', flag: flagEmoji('MC'), name: 'Monaco' },
  { code: 'LI', dial: '+423', flag: flagEmoji('LI'), name: 'Liechtenstein' },
  // Southern Europe
  { code: 'IT', dial: '+39', flag: flagEmoji('IT'), name: 'Italy' },
  { code: 'ES', dial: '+34', flag: flagEmoji('ES'), name: 'Spain' },
  { code: 'PT', dial: '+351', flag: flagEmoji('PT'), name: 'Portugal' },
  { code: 'GR', dial: '+30', flag: flagEmoji('GR'), name: 'Greece' },
  { code: 'MT', dial: '+356', flag: flagEmoji('MT'), name: 'Malta' },
  { code: 'CY', dial: '+357', flag: flagEmoji('CY'), name: 'Cyprus' },
  { code: 'AD', dial: '+376', flag: flagEmoji('AD'), name: 'Andorra' },
  { code: 'SM', dial: '+378', flag: flagEmoji('SM'), name: 'San Marino' },
  { code: 'VA', dial: '+379', flag: flagEmoji('VA'), name: 'Vatican City' },
  // Northern Europe
  { code: 'SE', dial: '+46', flag: flagEmoji('SE'), name: 'Sweden' },
  { code: 'NO', dial: '+47', flag: flagEmoji('NO'), name: 'Norway' },
  { code: 'DK', dial: '+45', flag: flagEmoji('DK'), name: 'Denmark' },
  { code: 'FI', dial: '+358', flag: flagEmoji('FI'), name: 'Finland' },
  { code: 'IS', dial: '+354', flag: flagEmoji('IS'), name: 'Iceland' },
  // Eastern Europe
  { code: 'PL', dial: '+48', flag: flagEmoji('PL'), name: 'Poland' },
  { code: 'CZ', dial: '+420', flag: flagEmoji('CZ'), name: 'Czech Republic' },
  { code: 'SK', dial: '+421', flag: flagEmoji('SK'), name: 'Slovakia' },
  { code: 'HU', dial: '+36', flag: flagEmoji('HU'), name: 'Hungary' },
  { code: 'RO', dial: '+40', flag: flagEmoji('RO'), name: 'Romania' },
  { code: 'BG', dial: '+359', flag: flagEmoji('BG'), name: 'Bulgaria' },
  { code: 'HR', dial: '+385', flag: flagEmoji('HR'), name: 'Croatia' },
  { code: 'SI', dial: '+386', flag: flagEmoji('SI'), name: 'Slovenia' },
  { code: 'RS', dial: '+381', flag: flagEmoji('RS'), name: 'Serbia' },
  { code: 'BA', dial: '+387', flag: flagEmoji('BA'), name: 'Bosnia & Herzegovina' },
  { code: 'ME', dial: '+382', flag: flagEmoji('ME'), name: 'Montenegro' },
  { code: 'MK', dial: '+389', flag: flagEmoji('MK'), name: 'North Macedonia' },
  { code: 'AL', dial: '+355', flag: flagEmoji('AL'), name: 'Albania' },
  { code: 'XK', dial: '+383', flag: flagEmoji('XK'), name: 'Kosovo' },
  { code: 'MD', dial: '+373', flag: flagEmoji('MD'), name: 'Moldova' },
  { code: 'UA', dial: '+380', flag: flagEmoji('UA'), name: 'Ukraine' },
  { code: 'BY', dial: '+375', flag: flagEmoji('BY'), name: 'Belarus' },
  { code: 'RU', dial: '+7', flag: flagEmoji('RU'), name: 'Russia' },
  { code: 'EE', dial: '+372', flag: flagEmoji('EE'), name: 'Estonia' },
  { code: 'LV', dial: '+371', flag: flagEmoji('LV'), name: 'Latvia' },
  { code: 'LT', dial: '+370', flag: flagEmoji('LT'), name: 'Lithuania' },
  { code: 'GE', dial: '+995', flag: flagEmoji('GE'), name: 'Georgia' },
  { code: 'AM', dial: '+374', flag: flagEmoji('AM'), name: 'Armenia' },
  { code: 'AZ', dial: '+994', flag: flagEmoji('AZ'), name: 'Azerbaijan' },
  // Middle East
  { code: 'TR', dial: '+90', flag: flagEmoji('TR'), name: 'Turkey' },
  { code: 'IL', dial: '+972', flag: flagEmoji('IL'), name: 'Israel' },
  { code: 'PS', dial: '+970', flag: flagEmoji('PS'), name: 'Palestine' },
  { code: 'LB', dial: '+961', flag: flagEmoji('LB'), name: 'Lebanon' },
  { code: 'JO', dial: '+962', flag: flagEmoji('JO'), name: 'Jordan' },
  { code: 'SY', dial: '+963', flag: flagEmoji('SY'), name: 'Syria' },
  { code: 'IQ', dial: '+964', flag: flagEmoji('IQ'), name: 'Iraq' },
  { code: 'IR', dial: '+98', flag: flagEmoji('IR'), name: 'Iran' },
  { code: 'SA', dial: '+966', flag: flagEmoji('SA'), name: 'Saudi Arabia' },
  { code: 'AE', dial: '+971', flag: flagEmoji('AE'), name: 'United Arab Emirates' },
  { code: 'QA', dial: '+974', flag: flagEmoji('QA'), name: 'Qatar' },
  { code: 'KW', dial: '+965', flag: flagEmoji('KW'), name: 'Kuwait' },
  { code: 'BH', dial: '+973', flag: flagEmoji('BH'), name: 'Bahrain' },
  { code: 'OM', dial: '+968', flag: flagEmoji('OM'), name: 'Oman' },
  { code: 'YE', dial: '+967', flag: flagEmoji('YE'), name: 'Yemen' },
  // North Africa
  { code: 'EG', dial: '+20', flag: flagEmoji('EG'), name: 'Egypt' },
  { code: 'LY', dial: '+218', flag: flagEmoji('LY'), name: 'Libya' },
  { code: 'TN', dial: '+216', flag: flagEmoji('TN'), name: 'Tunisia' },
  { code: 'DZ', dial: '+213', flag: flagEmoji('DZ'), name: 'Algeria' },
  { code: 'MA', dial: '+212', flag: flagEmoji('MA'), name: 'Morocco' },
  { code: 'SD', dial: '+249', flag: flagEmoji('SD'), name: 'Sudan' },
  { code: 'SS', dial: '+211', flag: flagEmoji('SS'), name: 'South Sudan' },
  // West Africa
  { code: 'NG', dial: '+234', flag: flagEmoji('NG'), name: 'Nigeria' },
  { code: 'GH', dial: '+233', flag: flagEmoji('GH'), name: 'Ghana' },
  { code: 'SN', dial: '+221', flag: flagEmoji('SN'), name: 'Senegal' },
  { code: 'CI', dial: '+225', flag: flagEmoji('CI'), name: "Cote d'Ivoire" },
  { code: 'ML', dial: '+223', flag: flagEmoji('ML'), name: 'Mali' },
  { code: 'BF', dial: '+226', flag: flagEmoji('BF'), name: 'Burkina Faso' },
  { code: 'NE', dial: '+227', flag: flagEmoji('NE'), name: 'Niger' },
  { code: 'GN', dial: '+224', flag: flagEmoji('GN'), name: 'Guinea' },
  { code: 'SL', dial: '+232', flag: flagEmoji('SL'), name: 'Sierra Leone' },
  { code: 'LR', dial: '+231', flag: flagEmoji('LR'), name: 'Liberia' },
  { code: 'TG', dial: '+228', flag: flagEmoji('TG'), name: 'Togo' },
  { code: 'BJ', dial: '+229', flag: flagEmoji('BJ'), name: 'Benin' },
  { code: 'MR', dial: '+222', flag: flagEmoji('MR'), name: 'Mauritania' },
  { code: 'GM', dial: '+220', flag: flagEmoji('GM'), name: 'Gambia' },
  { code: 'GW', dial: '+245', flag: flagEmoji('GW'), name: 'Guinea-Bissau' },
  { code: 'CV', dial: '+238', flag: flagEmoji('CV'), name: 'Cape Verde' },
  // East Africa
  { code: 'KE', dial: '+254', flag: flagEmoji('KE'), name: 'Kenya' },
  { code: 'TZ', dial: '+255', flag: flagEmoji('TZ'), name: 'Tanzania' },
  { code: 'UG', dial: '+256', flag: flagEmoji('UG'), name: 'Uganda' },
  { code: 'RW', dial: '+250', flag: flagEmoji('RW'), name: 'Rwanda' },
  { code: 'BI', dial: '+257', flag: flagEmoji('BI'), name: 'Burundi' },
  { code: 'ET', dial: '+251', flag: flagEmoji('ET'), name: 'Ethiopia' },
  { code: 'ER', dial: '+291', flag: flagEmoji('ER'), name: 'Eritrea' },
  { code: 'DJ', dial: '+253', flag: flagEmoji('DJ'), name: 'Djibouti' },
  { code: 'SO', dial: '+252', flag: flagEmoji('SO'), name: 'Somalia' },
  { code: 'MG', dial: '+261', flag: flagEmoji('MG'), name: 'Madagascar' },
  { code: 'MU', dial: '+230', flag: flagEmoji('MU'), name: 'Mauritius' },
  { code: 'SC', dial: '+248', flag: flagEmoji('SC'), name: 'Seychelles' },
  { code: 'KM', dial: '+269', flag: flagEmoji('KM'), name: 'Comoros' },
  // Central Africa
  { code: 'CD', dial: '+243', flag: flagEmoji('CD'), name: 'DR Congo' },
  { code: 'CG', dial: '+242', flag: flagEmoji('CG'), name: 'Congo' },
  { code: 'CM', dial: '+237', flag: flagEmoji('CM'), name: 'Cameroon' },
  { code: 'CF', dial: '+236', flag: flagEmoji('CF'), name: 'Central African Republic' },
  { code: 'TD', dial: '+235', flag: flagEmoji('TD'), name: 'Chad' },
  { code: 'GA', dial: '+241', flag: flagEmoji('GA'), name: 'Gabon' },
  { code: 'GQ', dial: '+240', flag: flagEmoji('GQ'), name: 'Equatorial Guinea' },
  { code: 'ST', dial: '+239', flag: flagEmoji('ST'), name: 'Sao Tome & Principe' },
  // Southern Africa
  { code: 'ZA', dial: '+27', flag: flagEmoji('ZA'), name: 'South Africa' },
  { code: 'BW', dial: '+267', flag: flagEmoji('BW'), name: 'Botswana' },
  { code: 'NA', dial: '+264', flag: flagEmoji('NA'), name: 'Namibia' },
  { code: 'ZM', dial: '+260', flag: flagEmoji('ZM'), name: 'Zambia' },
  { code: 'ZW', dial: '+263', flag: flagEmoji('ZW'), name: 'Zimbabwe' },
  { code: 'MW', dial: '+265', flag: flagEmoji('MW'), name: 'Malawi' },
  { code: 'MZ', dial: '+258', flag: flagEmoji('MZ'), name: 'Mozambique' },
  { code: 'AO', dial: '+244', flag: flagEmoji('AO'), name: 'Angola' },
  { code: 'SZ', dial: '+268', flag: flagEmoji('SZ'), name: 'Eswatini' },
  { code: 'LS', dial: '+266', flag: flagEmoji('LS'), name: 'Lesotho' },
  // South Asia
  { code: 'IN', dial: '+91', flag: flagEmoji('IN'), name: 'India' },
  { code: 'PK', dial: '+92', flag: flagEmoji('PK'), name: 'Pakistan' },
  { code: 'BD', dial: '+880', flag: flagEmoji('BD'), name: 'Bangladesh' },
  { code: 'LK', dial: '+94', flag: flagEmoji('LK'), name: 'Sri Lanka' },
  { code: 'NP', dial: '+977', flag: flagEmoji('NP'), name: 'Nepal' },
  { code: 'BT', dial: '+975', flag: flagEmoji('BT'), name: 'Bhutan' },
  { code: 'MV', dial: '+960', flag: flagEmoji('MV'), name: 'Maldives' },
  { code: 'AF', dial: '+93', flag: flagEmoji('AF'), name: 'Afghanistan' },
  // Central Asia
  { code: 'KZ', dial: '+7', flag: flagEmoji('KZ'), name: 'Kazakhstan' },
  { code: 'UZ', dial: '+998', flag: flagEmoji('UZ'), name: 'Uzbekistan' },
  { code: 'TM', dial: '+993', flag: flagEmoji('TM'), name: 'Turkmenistan' },
  { code: 'KG', dial: '+996', flag: flagEmoji('KG'), name: 'Kyrgyzstan' },
  { code: 'TJ', dial: '+992', flag: flagEmoji('TJ'), name: 'Tajikistan' },
  { code: 'MN', dial: '+976', flag: flagEmoji('MN'), name: 'Mongolia' },
  // East Asia
  { code: 'CN', dial: '+86', flag: flagEmoji('CN'), name: 'China' },
  { code: 'JP', dial: '+81', flag: flagEmoji('JP'), name: 'Japan' },
  { code: 'KR', dial: '+82', flag: flagEmoji('KR'), name: 'South Korea' },
  { code: 'KP', dial: '+850', flag: flagEmoji('KP'), name: 'North Korea' },
  { code: 'TW', dial: '+886', flag: flagEmoji('TW'), name: 'Taiwan' },
  { code: 'HK', dial: '+852', flag: flagEmoji('HK'), name: 'Hong Kong' },
  { code: 'MO', dial: '+853', flag: flagEmoji('MO'), name: 'Macau' },
  // Southeast Asia
  { code: 'TH', dial: '+66', flag: flagEmoji('TH'), name: 'Thailand' },
  { code: 'VN', dial: '+84', flag: flagEmoji('VN'), name: 'Vietnam' },
  { code: 'ID', dial: '+62', flag: flagEmoji('ID'), name: 'Indonesia' },
  { code: 'MY', dial: '+60', flag: flagEmoji('MY'), name: 'Malaysia' },
  { code: 'SG', dial: '+65', flag: flagEmoji('SG'), name: 'Singapore' },
  { code: 'PH', dial: '+63', flag: flagEmoji('PH'), name: 'Philippines' },
  { code: 'MM', dial: '+95', flag: flagEmoji('MM'), name: 'Myanmar' },
  { code: 'KH', dial: '+855', flag: flagEmoji('KH'), name: 'Cambodia' },
  { code: 'LA', dial: '+856', flag: flagEmoji('LA'), name: 'Laos' },
  { code: 'BN', dial: '+673', flag: flagEmoji('BN'), name: 'Brunei' },
  { code: 'TL', dial: '+670', flag: flagEmoji('TL'), name: 'Timor-Leste' },
  // Oceania
  { code: 'AU', dial: '+61', flag: flagEmoji('AU'), name: 'Australia' },
  { code: 'NZ', dial: '+64', flag: flagEmoji('NZ'), name: 'New Zealand' },
  { code: 'FJ', dial: '+679', flag: flagEmoji('FJ'), name: 'Fiji' },
  { code: 'PG', dial: '+675', flag: flagEmoji('PG'), name: 'Papua New Guinea' },
  { code: 'WS', dial: '+685', flag: flagEmoji('WS'), name: 'Samoa' },
  { code: 'TO', dial: '+676', flag: flagEmoji('TO'), name: 'Tonga' },
  { code: 'VU', dial: '+678', flag: flagEmoji('VU'), name: 'Vanuatu' },
  { code: 'SB', dial: '+677', flag: flagEmoji('SB'), name: 'Solomon Islands' },
  { code: 'KI', dial: '+686', flag: flagEmoji('KI'), name: 'Kiribati' },
  { code: 'FM', dial: '+691', flag: flagEmoji('FM'), name: 'Micronesia' },
  { code: 'MH', dial: '+692', flag: flagEmoji('MH'), name: 'Marshall Islands' },
  { code: 'PW', dial: '+680', flag: flagEmoji('PW'), name: 'Palau' },
  { code: 'NR', dial: '+674', flag: flagEmoji('NR'), name: 'Nauru' },
  { code: 'TV', dial: '+688', flag: flagEmoji('TV'), name: 'Tuvalu' },
  { code: 'GU', dial: '+1671', flag: flagEmoji('GU'), name: 'Guam' },
];

/** Parse an E.164 value like "+1234567890" into { dial, number } */
function parseE164(value: string): { countryCode: string; dial: string; number: string } {
  if (!value || !value.startsWith('+')) return { countryCode: 'US', dial: '+1', number: value };
  // Try matching against known dial codes (longest first)
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (value.startsWith(c.dial)) {
      return { countryCode: c.code, dial: c.dial, number: value.slice(c.dial.length) };
    }
  }
  return { countryCode: 'US', dial: '+1', number: value.replace(/^\+/, '') };
}

interface PhoneInputMobileProps {
  value: string;
  onChange: (e164Value: string) => void;
  error?: string;
  label?: string;
}

export default function PhoneInputMobile({ value, onChange, error, label }: PhoneInputMobileProps) {
  const parsed = parseE164(value);
  const [selectedCountry, setSelectedCountry] = useState<Country>(
    () => COUNTRIES.find(c => c.code === parsed.countryCode) || COUNTRIES[0]
  );
  const [localNumber, setLocalNumber] = useState(parsed.number);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync outward whenever country or number changes
  const emitChange = useCallback((country: Country, number: string) => {
    const digits = number.replace(/\D/g, '');
    if (digits) {
      onChange(`${country.dial}${digits}`);
    } else {
      onChange('');
    }
  }, [onChange]);

  const handleNumberChange = (text: string) => {
    setLocalNumber(text);
    emitChange(selectedCountry, text);
  };

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setPickerVisible(false);
    setSearchQuery('');
    emitChange(country, localNumber);
  };

  const filteredCountries = searchQuery
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.dial.includes(searchQuery) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : COUNTRIES;

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.container, error ? styles.containerError : undefined]}>
        {/* Country selector */}
        <TouchableOpacity
          style={styles.countryButton}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <Text style={styles.dialCode}>{selectedCountry.dial}</Text>
          <ChevronDown size={14} color={colors.slate[400]} />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Phone number input */}
        <TextInput
          style={styles.input}
          value={localNumber}
          onChangeText={handleNumberChange}
          placeholder="Phone number"
          placeholderTextColor={colors.slate[400]}
          keyboardType="phone-pad"
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Country picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setPickerVisible(false); setSearchQuery(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity
                onPress={() => { setPickerVisible(false); setSearchQuery(''); }}
                hitSlop={8}
              >
                <X size={22} color={colors.slate[500]} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Search size={16} color={colors.slate[400]} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search countries..."
                placeholderTextColor={colors.slate[400]}
                autoFocus={Platform.OS !== 'web'}
              />
            </View>

            {/* Country list */}
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.countryRow,
                    item.code === selectedCountry.code && styles.countryRowSelected,
                  ]}
                  onPress={() => handleCountrySelect(item)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.countryDial}>{item.dial}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
    marginBottom: 6,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    minHeight: 48,
  },
  containerError: {
    borderColor: colors.error[500],
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  flag: {
    fontSize: 20,
  },
  dialCode: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.slate[200],
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    color: colors.error[600],
    marginTop: 4,
    marginLeft: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '70%',
    width: '100%',
    maxWidth: 480,
    paddingBottom: 34, // safe area
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[50],
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    paddingVertical: 0,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  countryRowSelected: {
    backgroundColor: colors.primary[50],
  },
  countryFlag: {
    fontSize: 22,
    width: 30,
  },
  countryName: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.slate[800],
  },
  countryDial: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    fontWeight: typography.fontWeight.medium,
  },
  separator: {
    height: 1,
    backgroundColor: colors.slate[100],
    marginLeft: spacing.xl + 30 + spacing.md,
  },
});
