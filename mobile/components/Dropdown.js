import { View, StyleSheet, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";

// items: [{ label, value }]
export default function Dropdown({ selectedValue, onValueChange, items }) {
  return (
    <View style={styles.wrap}>
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        dropdownIconColor="#8a7cff"
        style={styles.picker}
        itemStyle={styles.item}
      >
        {items.map((it) => (
          <Picker.Item key={String(it.value)} label={it.label} value={it.value} color={Platform.OS === "ios" ? "#fff" : undefined} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#1c1c26", borderRadius: 12, overflow: "hidden" },
  picker: { color: "#fff" },
  item: { color: "#fff" },
});
