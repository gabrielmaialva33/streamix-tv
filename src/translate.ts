import * as i18n from "@solid-primitives/i18n";
import en_dict from "../public/assets/lang/en.json";
import { createResource, createSignal } from "solid-js";
import { createLogger } from "./shared/logging/logger";

const logger = createLogger("I18n");

const [locale, setLocale] = createSignal("en");
// setLocale("es"); will switch to spanish

async function fetchDictionary(locale) {
  return fetch(`assets/lang/${locale}.json`)
    .then(response => response.json())
    .catch(error => {
      logger.warn("Failed to load translation dictionary", error);
    });
}

const [dict] = createResource(locale, fetchDictionary, {
  initialValue: en_dict,
});

const $t = i18n.translator(dict);

export { $t, locale, setLocale };
