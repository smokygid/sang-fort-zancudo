import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { api, NewsItem, Profile } from "./src/api";

const GOLD = "#D2AE58";
const BG = "#07111D";
const PANEL = "#101E2D";
const MUTED = "#91A0B2";
const TOKEN_KEY = "sang.mobile.session.v1";

type Tab = "Головна" | "Новини" | "Квиток" | "Сповіщення" | "Профіль";

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("Головна");
  const [serviceId, setServiceId] = useState("");
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async (sessionToken: string) => {
    const [account, publications] = await Promise.all([
      api.profile(sessionToken),
      api.news(),
    ]);
    setProfile(account);
    setNews(publications);
  }, []);

  const signOut = useCallback(async () => {
    const current = token;
    try {
      if (current) await api.logout(current);
    } catch {
      // The local credential is still cleared if the network is unavailable.
    } finally {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
      setProfile(null);
      setPassword("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMustChangePassword(false);
      setActiveTab("Головна");
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!saved) return;
        const account = await api.profile(saved);
        const publications = await api.news();
        if (mounted) {
          setToken(saved);
          setMustChangePassword(false);
          setProfile(account);
          setNews(publications);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleLogin = async () => {
    const normalizedId = serviceId.trim().toUpperCase();
    if (!normalizedId || !password) {
      setError("Введіть військовий номер і пароль.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.login(normalizedId, password);
      await SecureStore.setItemAsync(TOKEN_KEY, result.sessionToken);
      setToken(result.sessionToken);
      setPassword("");
      if (result.mustChangePassword) {
        setMustChangePassword(true);
        setCurrentPassword(password);
        return;
      }
      await loadAccount(result.sessionToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося увійти. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const submitPasswordChange = async () => {
    if (!token) return;
    if (newPassword !== confirmPassword) {
      setError("Підтвердження нового пароля не збігається.");
      return;
    }
    if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Пароль має містити щонайменше 12 символів, великі й малі літери та цифри.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(token, currentPassword, newPassword);
      setMustChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await loadAccount(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося змінити пароль.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await loadAccount(token);
    } catch (e) {
      Alert.alert("Помилка оновлення", e instanceof Error ? e.message : "Спробуйте пізніше.");
    } finally {
      setRefreshing(false);
    }
  };

  if (booting) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color={GOLD} size="large" /><Text style={styles.loadingText}>ПЕРЕВІРКА СЕСІЇ SANG</Text></SafeAreaView>;
  }

  if (!token || !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
          <Text style={styles.loginTitle}>SANG <Text style={styles.gold}>MOBILE</Text></Text>
          <Text style={styles.loginSubtitle}>SAN ANDREAS NATIONAL GUARD · FORT ZANCUDO</Text>
          <View style={styles.loginCard}>
            <Text style={styles.sectionKicker}>ЗАХИЩЕНИЙ ДОСТУП</Text>
            <Text style={styles.sectionTitle}>Вхід до системи</Text>
            <Text style={styles.fieldLabel}>ВІЙСЬКОВИЙ НОМЕР</Text>
            <TextInput
              value={serviceId}
              onChangeText={setServiceId}
              placeholder="SA-FZ-260012"
              placeholderTextColor="#65768A"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              style={styles.input}
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>ПАРОЛЬ</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Введіть пароль"
              placeholderTextColor="#65768A"
              secureTextEntry
              editable={!busy}
              style={styles.input}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} onPress={handleLogin} disabled={busy}>
              {busy ? <ActivityIndicator color={BG} /> : <Text style={styles.primaryButtonText}>УВІЙТИ ДО КАБІНЕТУ</Text>}
            </TouchableOpacity>
            <Text style={styles.loginHint}>Використовуйте ті самі облікові дані, що й на порталі SANG.</Text>
          </View>
          <Text style={styles.disclaimer}>ОФІЦІЙНИЙ МОБІЛЬНИЙ КАБІНЕТ SANG</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (mustChangePassword) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
          <Text style={styles.loginTitle}>ЗМІНА ПАРОЛЯ</Text>
          <Text style={styles.loginSubtitle}>ПЕРШИЙ ВХІД · ОБОВ’ЯЗКОВА ПРОЦЕДУРА</Text>
          <View style={styles.loginCard}>
            <Text style={styles.sectionTitle}>Створіть особистий пароль</Text>
            <Text style={styles.loginHint}>Мінімум 12 символів, великі й малі літери та цифри. Після зміни пароля інші активні сесії буде завершено.</Text>
            <Text style={styles.fieldLabel}>ПОТОЧНИЙ ПАРОЛЬ</Text>
            <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry editable={!busy} style={styles.input} placeholder="Тимчасовий пароль" placeholderTextColor="#65768A" />
            <Text style={styles.fieldLabel}>НОВИЙ ПАРОЛЬ</Text>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry editable={!busy} style={styles.input} placeholder="Новий пароль" placeholderTextColor="#65768A" />
            <Text style={styles.fieldLabel}>ПОВТОРІТЬ НОВИЙ ПАРОЛЬ</Text>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry editable={!busy} style={styles.input} placeholder="Підтвердження пароля" placeholderTextColor="#65768A" onSubmitEditing={submitPasswordChange} />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} onPress={submitPasswordChange} disabled={busy}>
              {busy ? <ActivityIndicator color={BG} /> : <Text style={styles.primaryButtonText}>ЗБЕРЕГТИ НОВИЙ ПАРОЛЬ</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} style={{ padding: 14, alignItems: "center" }}><Text style={styles.logoutText}>ВИЙТИ З ОБЛІКОВОГО ЗАПИСУ</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GOLD} />}
      >
        <View style={styles.header}>
          <View style={styles.brandMarkSmall}><Text style={styles.brandMarkText}>S</Text></View>
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>SANG <Text style={styles.gold}>MOBILE</Text></Text>
            <Text style={styles.brandSubtitle}>SAN ANDREAS NATIONAL GUARD</Text>
          </View>
          <View style={styles.online}><View style={styles.statusDot} /><Text style={styles.onlineText}>ONLINE</Text></View>
        </View>

        {activeTab === "Головна" && <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>FORT ZANCUDO · OFFICIAL PORTAL</Text>
            <Text style={styles.heroTitle}>СЛУЖБА. ЧЕСТЬ. ВІДДАНІСТЬ.</Text>
            <Text style={styles.heroCopy}>Вітаємо, {profile.fullName || profile.serviceNumber}.</Text>
            <View style={styles.statusRow}><View style={styles.statusDot} /><Text style={styles.statusText}>ВИ АВТОРИЗОВАНІ В СИСТЕМІ</Text></View>
            <View style={styles.heroLine} />
            <View style={styles.heroFooter}>
              <View><Text style={styles.statValue}>24/7</Text><Text style={styles.statLabel}>ГОТОВНІСТЬ</Text></View>
              <View style={styles.statDivider} />
              <View><Text style={styles.statValue}>FZ</Text><Text style={styles.statLabel}>FORT ZANCUDO</Text></View>
              <View style={styles.statDivider} />
              <View><Text style={styles.statValue}>SANG</Text><Text style={styles.statLabel}>NATIONAL GUARD</Text></View>
            </View>
          </View>
          <SectionHeading kicker="PERSONAL CENTER" title="Швидкий доступ" />
          <View style={styles.grid}>
            {[
              ["▣", "Мій квиток", "Електронне посвідчення", "Квиток" as Tab],
              ["▤", "Новини", "Повідомлення командування", "Новини" as Tab],
              ["♙", "Мій профіль", "Особисті дані та служба", "Профіль" as Tab],
              ["♢", "Сповіщення", "Системні повідомлення", "Сповіщення" as Tab],
            ].map(([icon, title, subtitle, tab]) => (
              <TouchableOpacity key={title} style={styles.shortcut} onPress={() => setActiveTab(tab as Tab)}>
                <Text style={styles.shortcutIcon}>{icon}</Text><Text style={styles.shortcutTitle}>{title}</Text><Text style={styles.shortcutSubtitle}>{subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <SectionHeading kicker="COMMAND INFORMATION" title="Останні новини" />
          {news.slice(0, 3).map(item => <NewsCard key={item.id} item={item} />)}
          {news.length === 0 && <EmptyState text="Поки що немає опублікованих новин." />}
        </>}

        {activeTab === "Новини" && <>
          <SectionHeading kicker="COMMAND INFORMATION" title="Новини SANG" />
          {news.map(item => <NewsCard key={item.id} item={item} />)}
          {news.length === 0 && <EmptyState text="Поки що немає опублікованих новин." />}
        </>}

        {activeTab === "Квиток" && <>
          <SectionHeading kicker="DIGITAL MILITARY ID" title="Електронний військовий квиток" />
          <View style={styles.idCard}>
            <Text style={styles.idEyebrow}>SAN ANDREAS NATIONAL GUARD</Text>
            <Text style={styles.idHeading}>MILITARY IDENTIFICATION</Text>
            <View style={styles.idDivider} />
            <Text style={styles.idLabel}>ВІЙСЬКОВОСЛУЖБОВЕЦЬ</Text>
            <Text style={styles.idName}>{profile.fullName || "Ім'я не вказано"}</Text>
            <View style={styles.idRow}><View style={styles.idCell}><Text style={styles.idLabel}>ВІЙСЬКОВИЙ №</Text><Text style={styles.idValue}>{profile.serviceNumber}</Text></View><View style={styles.idCell}><Text style={styles.idLabel}>ЗВАННЯ</Text><Text style={styles.idValue}>{profile.rank || "Не вказано"}</Text></View></View>
            <View style={styles.idRow}><View style={styles.idCell}><Text style={styles.idLabel}>ПІДРОЗДІЛ</Text><Text style={styles.idValue}>{profile.unit || "Не вказано"}</Text></View><View style={styles.idCell}><Text style={styles.idLabel}>MOS</Text><Text style={styles.idValue}>{profile.mos || "—"}</Text></View></View>
            <View style={styles.idDivider} />
            <Text style={styles.idFoot}>FORT ZANCUDO · SAN ANDREAS</Text>
            <Text style={styles.idNote}>Цифровий перегляд посвідчення. QR-перевірку буде додано окремим етапом.</Text>
          </View>
        </>}

        {activeTab === "Сповіщення" && <>
          <SectionHeading kicker="PERSONNEL ALERTS" title="Сповіщення" />
          <EmptyState text="Нові системні сповіщення з'являться тут після підключення мобільного центру повідомлень." />
        </>}

        {activeTab === "Профіль" && <>
          <SectionHeading kicker="PERSONNEL PROFILE" title="Мій профіль" />
          <View style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(profile.fullName || "S").slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.profileName}>{profile.fullName || "Ім'я не вказано"}</Text>
            <Text style={styles.profileRank}>{profile.rank || "Військовослужбовець SANG"}</Text>
            <View style={styles.profileDivider} />
            <ProfileLine label="Військовий номер" value={profile.serviceNumber} />
            <ProfileLine label="Підрозділ" value={profile.unit || "Не вказано"} />
            <ProfileLine label="MOS" value={profile.mos || "—"} />
            <ProfileLine label="Статус служби" value={profile.serviceStatus || "Не вказано"} />
            <ProfileLine label="Останнє оновлення" value={profile.updatedAt || "—"} />
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={() => Alert.alert("Вийти з акаунта?", "Поточну мобільну сесію буде завершено.", [{text:"Скасувати",style:"cancel"},{text:"Вийти",style:"destructive",onPress:signOut}])}>
            <Text style={styles.logoutText}>ЗАВЕРШИТИ СЕСІЮ</Text>
          </TouchableOpacity>
        </>}
        <Text style={styles.disclaimer}>SANG MOBILE · ЗАХИЩЕНИЙ МОБІЛЬНИЙ КАБІНЕТ</Text>
      </ScrollView>

      <View style={styles.tabBar}>
        {(["Головна", "Новини", "Квиток", "Сповіщення", "Профіль"] as Tab[]).map((tab, index) => (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabIcon, activeTab === tab && styles.tabActive]}>{["⌂", "▤", "▣", "♢", "♙"][index]}</Text>
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return <View style={styles.sectionHeading}><View><Text style={styles.sectionKicker}>{kicker}</Text><Text style={styles.sectionTitle}>{title}</Text></View></View>;
}
function NewsCard({ item }: { item: NewsItem }) {
  return <View style={styles.newsCard}><View style={styles.newsTop}><Text style={styles.newsDate}>{item.news_date || item.published_at || ""}</Text><Text style={styles.newsTag}>{item.category || "SANG"}</Text></View><Text style={styles.newsTitle}>{item.title}</Text>{!!item.excerpt && <Text style={styles.newsExcerpt}>{item.excerpt}</Text>}</View>;
}
function EmptyState({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}
function ProfileLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.profileLine}><Text style={styles.profileLabel}>{label}</Text><Text style={styles.profileValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  loadingText: { color: MUTED, fontSize: 9, letterSpacing: 1.5, marginTop: 14 },
  loginWrap: { flex: 1, justifyContent: "center", padding: 24 },
  brandMark: { width: 58, height: 58, borderWidth: 1, borderColor: GOLD, borderRadius: 17, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 18 },
  brandMarkText: { color: GOLD, fontSize: 29, fontWeight: "900" },
  loginTitle: { color: "#F3F5F7", fontSize: 25, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  gold: { color: GOLD },
  loginSubtitle: { color: MUTED, fontSize: 8, letterSpacing: 1.2, textAlign: "center", marginTop: 8, marginBottom: 32 },
  loginCard: { backgroundColor: PANEL, borderRadius: 18, borderWidth: 1, borderColor: "#26394C", padding: 20 },
  sectionKicker: { color: GOLD, fontSize: 8, letterSpacing: 1.4, fontWeight: "700", marginBottom: 6 },
  sectionTitle: { color: "#F1F4F7", fontSize: 19, fontWeight: "800", marginBottom: 18 },
  fieldLabel: { color: "#AAB6C4", fontSize: 9, letterSpacing: 1, fontWeight: "700", marginTop: 14, marginBottom: 7 },
  input: { color: "#F1F4F7", backgroundColor: "#091522", borderWidth: 1, borderColor: "#30445A", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14 },
  error: { color: "#F19A9A", fontSize: 11, lineHeight: 17, marginTop: 12 },
  primaryButton: { backgroundColor: GOLD, minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 20 },
  disabled: { opacity: 0.65 },
  primaryButtonText: { color: BG, fontSize: 10, letterSpacing: 1.1, fontWeight: "900" },
  loginHint: { color: MUTED, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 16 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  brandMarkSmall: { width: 40, height: 40, borderWidth: 1, borderColor: GOLD, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 11 },
  brand: { flex: 1 },
  brandTitle: { color: "#F3F5F7", fontSize: 16, fontWeight: "900", letterSpacing: 1.4 },
  brandSubtitle: { color: MUTED, fontSize: 7, letterSpacing: 1.1, marginTop: 3 },
  online: { flexDirection: "row", alignItems: "center", backgroundColor: "#142A28", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7 },
  onlineText: { color: "#8BCDA4", fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  hero: { backgroundColor: PANEL, borderRadius: 18, borderWidth: 1, borderColor: "#26394C", padding: 19, marginBottom: 28 },
  eyebrow: { color: GOLD, fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 16 },
  heroTitle: { color: "#F4F6F8", fontSize: 22, lineHeight: 29, fontWeight: "900" },
  heroCopy: { color: "#AAB6C4", fontSize: 12, lineHeight: 19, marginTop: 9 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#69C58A", marginRight: 8 },
  statusText: { color: "#B8C8D7", fontSize: 8, letterSpacing: 1, fontWeight: "700" },
  heroLine: { height: 1, backgroundColor: "#2B3D50", marginTop: 19, marginBottom: 16 },
  heroFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statValue: { color: GOLD, fontSize: 17, fontWeight: "900" },
  statLabel: { color: MUTED, fontSize: 7, letterSpacing: 0.7, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: "#2B3D50" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 25 },
  shortcut: { width: "48.2%", minHeight: 112, padding: 13, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: "#203247", marginBottom: 10 },
  shortcutIcon: { color: GOLD, fontSize: 21, marginBottom: 9 },
  shortcutTitle: { color: "#F1F4F7", fontSize: 12, fontWeight: "800" },
  shortcutSubtitle: { color: MUTED, fontSize: 9, marginTop: 5, lineHeight: 14 },
  newsCard: { padding: 15, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: "#203247", marginBottom: 10 },
  newsTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  newsDate: { color: MUTED, fontSize: 9 },
  newsTag: { color: GOLD, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  newsTitle: { color: "#F1F4F7", fontSize: 13, fontWeight: "800", lineHeight: 19 },
  newsExcerpt: { color: MUTED, fontSize: 11, lineHeight: 17, marginTop: 7 },
  empty: { padding: 18, backgroundColor: PANEL, borderRadius: 14, borderWidth: 1, borderColor: "#203247" },
  emptyText: { color: MUTED, fontSize: 11, lineHeight: 18 },
  idCard: { backgroundColor: "#142437", borderRadius: 18, borderWidth: 1, borderColor: GOLD, padding: 19 },
  idEyebrow: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  idHeading: { color: "#D9E0E8", fontSize: 8, letterSpacing: 1.3, marginTop: 5 },
  idDivider: { height: 1, backgroundColor: "#526173", marginVertical: 17 },
  idLabel: { color: "#9EADBC", fontSize: 8, letterSpacing: 1, marginBottom: 6 },
  idName: { color: "#F4F6F8", fontSize: 21, fontWeight: "900", marginBottom: 17 },
  idRow: { flexDirection: "row", marginBottom: 15 },
  idCell: { flex: 1 },
  idValue: { color: "#F4F6F8", fontSize: 12, fontWeight: "700" },
  idFoot: { color: GOLD, fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  idNote: { color: MUTED, fontSize: 9, lineHeight: 14, marginTop: 12 },
  profileCard: { backgroundColor: PANEL, borderRadius: 17, borderWidth: 1, borderColor: "#26394C", padding: 18 },
  avatar: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#26394C", borderWidth: 1, borderColor: GOLD, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12 },
  avatarText: { color: GOLD, fontSize: 24, fontWeight: "900" },
  profileName: { color: "#F4F6F8", textAlign: "center", fontSize: 18, fontWeight: "900" },
  profileRank: { color: GOLD, textAlign: "center", fontSize: 11, marginTop: 5 },
  profileDivider: { height: 1, backgroundColor: "#2B3D50", marginVertical: 17 },
  profileLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#24364A" },
  profileLabel: { color: MUTED, fontSize: 10, flex: 1 },
  profileValue: { color: "#E6EBF0", fontSize: 10, fontWeight: "700", flex: 1, textAlign: "right" },
  logoutButton: { borderWidth: 1, borderColor: "#8D4B4B", borderRadius: 11, padding: 15, alignItems: "center", marginTop: 15 },
  logoutText: { color: "#E49A9A", fontSize: 9, letterSpacing: 1, fontWeight: "900" },
  disclaimer: { color: "#647487", textAlign: "center", fontSize: 7, letterSpacing: 1.1, marginTop: 20 },
  tabBar: { flexDirection: "row", backgroundColor: "#0B1724", borderTopWidth: 1, borderTopColor: "#26394C", paddingTop: 9, paddingBottom: 7 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabIcon: { color: MUTED, fontSize: 19, marginBottom: 3 },
  tabLabel: { color: MUTED, fontSize: 8 },
  tabActive: { color: GOLD },
});
