import { FlatList, Text, View, StyleSheet, RefreshControl } from "react-native";
import TrackCard from "./TrackCard";
import { colors, space, typography } from "../lib/theme";

// 2-column grid renderer for tracks. Used by LibraryScreen. The TrackList
// (vertical) component is kept for screens where one-line rows are better
// (playlist detail, search results).
export default function TrackGrid({
  tracks, refreshing, onRefresh, header, emptyText, onPressItem, renderActions,
}) {
  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={tracks}
      keyExtractor={(t) => String(t.id)}
      numColumns={2}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <TrackCard track={item} onPress={onPressItem} renderActions={renderActions} />
      )}
      ListHeaderComponent={
        typeof header === "string"
          ? <Text style={styles.h1}>{header}</Text>
          : header
      }
      ListEmptyComponent={
        <Text style={styles.empty}>{emptyText || "Nothing here yet."}</Text>
      }
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxxl },
  row: { gap: space.lg },
  h1: { ...typography.h1, color: colors.text, marginBottom: space.lg },
  empty: { ...typography.body, color: colors.textFade, textAlign: "center", marginTop: space.xxxl },
});
