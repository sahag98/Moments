import { SafeAreaView } from "react-native-safe-area-context";

export const Container = ({ children }: { children: React.ReactNode }) => {
  return (
    <SafeAreaView edges={["top"]} className={styles.container}>
      {children}
    </SafeAreaView>
  );
};

const styles = {
  container: "flex bg-background flex-1 p-2 sm:p-2",
};
