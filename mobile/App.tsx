import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GOLD = "#D2AE58";
const BG = "#07111D";
const PANEL = "#101E2D";
const MUTED = "#91A0B2";

const shortcuts = [
  { icon: "▣", title: "Мій квиток", subtitle: "Електронне посвідчення" },
  { icon: "♙", title: "Особовий склад", subtitle: "Склад підрозділів" },
  { icon: "▤", title: "Контракти", subtitle: "Статус служби" },
  { icon: "⚑", title: "Накази", subtitle: "Розпорядження командування" },
  { icon: "✚", title: "EMS", subtitle: "Медичні повідомлення" },
  { icon: "▣", title: "Матеріали", subtitle: "Службові заявки" },
];

const news = [
  { date: "01.10.2026", title: "Набір до San Andreas National Guard", tag: "НАБІР" },
  { date: "30.09.2026", title: "Оновлено програму КМБ / БЗВП", tag: "ПІДГОТОВКА" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("Головна");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>SANG <Text style={styles.gold}>MOBILE</Text></Text>
            <Text style={styles.brandSubtitle}>SAN ANDREAS NATIONAL GUARD</Text>
          </View>
          <TouchableOpacity style={styles.notification} accessibilityLabel="Сповіщення">
            <Text style={styles.notificationText}>♢</Text>
            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>FORT ZANCUDO · OFFICIAL PORTAL</Text>
          <Text style={styles.heroTitle}>СЛУЖБА. ЧЕСТЬ. ВІДДАНІСТЬ.</Text>
          <Text style={styles.heroCopy}>Мобільний центр управління службою San Andreas National Guard.</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>СИСТЕМА ГОТОВА ДО РОБОТИ</Text>
          </View>
          <View style={styles.heroLine} />
          <View style={styles.heroFooter}>
            <View><Text style={styles.statValue}>24/7</Text><Text style={styles.statLabel}>ГОТОВНІСТЬ</Text></View>
            <View style={styles.statDivider} />
            <View><Text style={styles.statValue}>06</Text><Text style={styles.statLabel}>ПІДРОЗДІЛІВ</Text></View>
            <View style={styles.statDivider} />
            <View><Text style={styles.statValue}>FZ</Text><Text style={styles.statLabel}>FORT ZANCUDO</Text></View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionKicker}>PERSONAL CENTER</Text><Text style={styles.sectionTitle}>Швидкий доступ</Text></View>
          <Text style={styles.sectionCount}>06 РОЗДІЛІВ</Text>
        </View>
        <View style={styles.grid}>
          {shortcuts.map((item) => (
            <TouchableOpacity key={item.title} style={styles.shortcut} activeOpacity={0.75}>
              <Text style={styles.shortcutIcon}>{item.icon}</Text>
              <Text style={styles.shortcutTitle}>{item.title}</Text>
              <Text style={styles.shortcutSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionKicker}>COMMAND INFORMATION</Text><Text style={styles.sectionTitle}>Новини та повідомлення</Text></View>
          <TouchableOpacity><Text style={styles.more}>УСІ →</Text></TouchableOpacity>
        </View>
        {news.map((item) => (
          <TouchableOpacity key={item.title} style={styles.newsCard} activeOpacity={0.75}>
            <View style={styles.newsTop}><Text style={styles.newsDate}>{item.date}</Text><Text style={styles.newsTag}>{item.tag}</Text></View>
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsMore}>ЧИТАТИ ПОВІДОМЛЕННЯ ↗</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.disclaimer}>SANG MOBILE · ОФІЦІЙНИЙ МОБІЛЬНИЙ КАБІНЕТ</Text>
      </ScrollView>

      <View style={styles.tabBar}>
        {["Головна", "Новини", "Квиток", "Сповіщення", "Профіль"].map((tab, index) => (
          <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabIcon, activeTab === tab && styles.tabActive]}>{["⌂", "▤", "▣", "♢", "♙"][index]}</Text>
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  brandMark: { width: 42, height: 42, borderWidth: 1, borderColor: GOLD, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 11 },
  brandMarkText: { color: GOLD, fontSize: 23, fontWeight: "900" },
  brand: { flex: 1 },
  brandTitle: { color: "#F3F5F7", fontSize: 17, fontWeight: "900", letterSpacing: 1.4 },
  gold: { color: GOLD },
  brandSubtitle: { color: MUTED, fontSize: 8, letterSpacing: 1.5, marginTop: 3 },
  notification: { width: 40, height: 40, borderRadius: 12, backgroundColor: PANEL, alignItems: "center", justifyContent: "center" },
  notificationText: { color: "#F3F5F7", fontSize: 23 },
  notificationDot: { position: "absolute", top: 9, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD },
  hero: { backgroundColor: PANEL, borderRadius: 18, borderWidth: 1, borderColor: "#26394C", padding: 19, overflow: "hidden", marginBottom: 28 },
  eyebrow: { color: GOLD, fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 16 },
  heroTitle: { color: "#F4F6F8", fontSize: 22, lineHeight: 29, fontWeight: "900", letterSpacing: 0.4, maxWidth: 270 },
  heroCopy: { color: "#AAB6C4", fontSize: 12, lineHeight: 19, marginTop: 9, maxWidth: 280 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#69C58A", marginRight: 8 },
  statusText: { color: "#B8C8D7", fontSize: 8, letterSpacing: 1.2, fontWeight: "700" },
  heroLine: { height: 1, backgroundColor: "#2B3D50", marginTop: 19, marginBottom: 16 },
  heroFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statValue: { color: GOLD, fontSize: 20, fontWeight: "900" },
  statLabel: { color: MUTED, fontSize: 7, letterSpacing: 1, marginTop: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: "#2B3D50" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  sectionKicker: { color: GOLD, fontSize: 8, letterSpacing: 1.4, fontWeight: "700", marginBottom: 5 },
  sectionTitle: { color: "#F1F4F7", fontSize: 18, fontWeight: "800" },
  sectionCount: { color: MUTED, fontSize: 8, letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 29 },
  shortcut: { width: "48.2%", minHeight: 116, padding: 13, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: "#203247", marginBottom: 10 },
  shortcutIcon: { color: GOLD, fontSize: 22, marginBottom: 10 },
  shortcutTitle: { color: "#F1F4F7", fontSize: 12, fontWeight: "800" },
  shortcutSubtitle: { color: MUTED, fontSize: 9, marginTop: 5, lineHeight: 14 },
  more: { color: GOLD, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  newsCard: { padding: 15, borderRadius: 14, backgroundColor: PANEL, borderWidth: 1, borderColor: "#203247", marginBottom: 10 },
  newsTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  newsDate: { color: MUTED, fontSize: 9 },
  newsTag: { color: GOLD, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  newsTitle: { color: "#F1F4F7", fontSize: 13, fontWeight: "800", lineHeight: 19 },
  newsMore: { color: GOLD, fontSize: 8, fontWeight: "800", letterSpacing: 1, marginTop: 13 },
  disclaimer: { color: "#647487", textAlign: "center", fontSize: 7, letterSpacing: 1.1, marginTop: 17 },
  tabBar: { flexDirection: "row", backgroundColor: "#0B1724", borderTopWidth: 1, borderTopColor: "#26394C", paddingTop: 9, paddingBottom: 7 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabIcon: { color: MUTED, fontSize: 19, marginBottom: 3 },
  tabLabel: { color: MUTED, fontSize: 8 },
  tabActive: { color: GOLD },
});
