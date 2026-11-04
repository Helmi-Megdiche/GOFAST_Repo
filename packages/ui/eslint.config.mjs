import { reactConfig } from "@fastgo/config/eslint/react";

// packages/ui is the only place allowed to hold hex values (design tokens).
export default reactConfig({ allowHex: true });
