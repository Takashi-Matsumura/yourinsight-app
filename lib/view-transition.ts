/// <reference types="react/canary" />

// vinext redirects every `react` import in a file that names ViewTransition to its
// canary shim. In dev that shim cannot re-export the other named React APIs
// (startTransition, useState, ...), so keep ViewTransition isolated here.
import { ViewTransition } from "react";

export { ViewTransition };
