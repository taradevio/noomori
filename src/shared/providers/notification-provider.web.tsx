import { createContext, useContext } from "react";

const value = {
  available: false,
  enabled: false,
  error: null,
  isPending: false,
  setEnabled: async (_enabled: boolean) => undefined,
  prepareForSignOut: async () => undefined,
};

const NotificationContext = createContext(value);

export function NotificationProvider({ children }: React.PropsWithChildren) {
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
