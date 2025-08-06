# Instrukcja Edycji Systemu HotelChat

## Architektura Systemu

System HotelChat składa się z dwóch głównych komponentów:

### 🔧 Backend: `hotel-chat-script` (ten katalog)
- **Typ**: Cloudflare Worker (TypeScript)
- **Funkcja**: Obsługa zapytań AI, integracja z Google Sheets, email, LLM providers
- **Deployment**: Cloudflare Workers (test/prod branches)

### 🎨 Frontend: `../hotel-chat-front` 
- **Typ**: Next.js 14 aplikacja
- **Funkcja**: Widget czatu, interfejs użytkownika
- **Deployment**: Cloudflare Pages

---

## 📁 Kluczowe Pliki Konfiguracyjne

### Backend - Pliki do Edycji (w tym katalogu)

#### 1. `src/examples/hotel-smile-kv-config.json`
**Funkcja**: Główna konfiguracja tenanta (hotelu)
```json
{
  "spreadsheetId": "ID_ARKUSZA_GOOGLE_SHEETS",
  "excel-config": "Rozszerzenie dla excel.md - specyficzne dla hotelu instrukcje wyboru arkuszy",
  "general-prompt-config": "Rozszerzenie dla general.md - specyficzne reguły dla hotelu", 
  "email-prompt-config": "Rozszerzenie dla email.md - specyficzne konfiguracje email",
  "buttons-prompt-config": "Rozszerzenie dla buttons.md - specyficzne przyciski dla hotelu",
  "emailTo": ["email1@example.com", "email2@example.com"]
}
```

⚠️ **WAŻNE**: Po zmianie `spreadsheetId` należy **ZAWSZE** zregenerować `excel-config` używając MCP Google Sheets do odczytania struktury nowego arkusza.

#### 2. Pliki promptów systemowych (`.md`) - GŁÓWNE PROMPTY:

**`src/examples/general.md`**
- **Funkcja**: Główne zachowanie AI asystenta (WSPÓLNE dla wszystkich hoteli)
- Zasady komunikacji z gośćmi
- Workflow: UNDERSTAND → COLLECT → ANSWER
- 🔄 **Sync z Langfuse**: Zmiany muszą trafić do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**`src/examples/buttons.md`**
- **Funkcja**: Reguły generowania dynamicznych przycisków (WSPÓLNE dla wszystkich hoteli)
- Kategorie: Services, Information, Contact
- 🔄 **Sync z Langfuse**: Zmiany muszą trafić do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**`src/examples/email.md`**
- **Funkcja**: Format JSON dla obsługi email (WSPÓLNE dla wszystkich hoteli)
- Wymagane informacje do rezerwacji
- Logika wysyłania powiadomień
- 🔄 **Sync z Langfuse**: Zmiany muszą trafić do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**`src/examples/excel.md`**
- **Funkcja**: Strategia wyboru arkuszy Google Sheets (WSPÓLNE dla wszystkich hoteli)
- Mapowanie zapytań na konkretne arkusze
- 🔄 **Sync z Langfuse**: Zmiany muszą trafić do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

### Frontend - Pliki do Edycji

#### 1. `../hotel-chat-front/src/example/smile.json`
**Funkcja**: Konfiguracja wyglądu i tekstów dla konkretnego hotelu
```json
{
  "id": "smile",
  "name": "Hotel Smile",
  "domain": "https://hotelsmile.pl/",
  "setup": [{
    "utm": "default",
    "config": {
      "webchat": {
        "logo": "URL_LOGA",
        "backgroundImage": "URL_TŁA", 
        "cssClass": "/* Style CSS */",
        "appTitle": {"pl": "Tytuł", "en": "Title"},
        // ... inne tłumaczenia i konfiguracja
      }
    }
  }]
}
```

#### 2. `../hotel-chat-front/mock_data/` (JSON files)
- `Additional_Services_Upselling.json`
- `Dining_Options.json` 
- `SPA_Wellness.json`

**Funkcja**: Dane testowe dla rozwoju (nie używane w produkcji)

---

## 🔄 Mechanizm Działania

### 1. Ładowanie Konfiguracji
```
Frontend → TENANT_CONFIG_ENDPOINT → Backend KV Store → Konfiguracja JSON
```

### 2. Komunikacja Chat
```
Frontend → BACKEND_ENDPOINT → ChatHandler → Tasks → LLM Providers → Response
```

### 3. Pipeline Zadań (Backend)
1. **DataCollectionTask** - Zbiera config, sesję, prompty z Langfuse
2. **ExcelSheetMatchingTask** - Wybiera odpowiednie arkusze
3. **ExcelDataFetchingTask** - Pobiera dane z Google Sheets
4. **GuestServiceTask** - Generuje odpowiedź AI
5. **ButtonsTask** - Tworzy dynamiczne przyciski
6. **EmailTask** - Obsługuje rezerwacje email

---

## 🎯 Zasady Edycji Promptów

### ⚖️ Podział Odpowiedzialności

#### Główne Prompty (`.md`) - WSPÓLNE dla wszystkich hoteli
- `general.md`, `buttons.md`, `email.md`, `excel.md`
- **Kiedy edytować**: Zmiany logiki ogólnej, nowe funkcjonalności
- **Gdzie**: Pliki `.md` + synchronizacja z [Langfuse](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

#### Konfiguracje Hotelu (JSON) - SPECYFICZNE dla jednego hotelu  
- `hotel-NAZWA-kv-config.json` → pola `*-prompt-config`
- **Kiedy edytować**: Specyficzne zachowania dla konkretnego hotelu
- **Gdzie**: Tylko w pliku konfiguracyjnym hotelu

### 🤔 Jak Zdecydować Gdzie Dodać Zmianę?

**Pytanie**: Czy ta zmiana dotyczy wszystkich hoteli?
- ✅ **TAK** → Edytuj główny prompt `.md` + sync z Langfuse
- ❌ **NIE** → Dodaj do `*-prompt-config` w JSON hotelu

**W razie wątpliwości - ZAWSZE PYTAJ!**

---

## 🛠️ Jak Edytować

### Dodanie Nowego Hotelu

#### 1. Backend Configuration
```bash
cd src/examples/
```

**Stwórz**: `hotel-NAZWA-kv-config.json`
```json
{
  "spreadsheetId": "NOWY_ID_ARKUSZA_GOOGLE",
  "excel-config": "# ROZSZERZENIE excel.md dla Hotel NAZWA\n## Specyficzne arkusze...",
  "general-prompt-config": "# ROZSZERZENIE general.md dla Hotel NAZWA\n## Specyficzne reguły...", 
  "email-prompt-config": "# ROZSZERZENIE email.md dla Hotel NAZWA\n## Specyficzne email...",
  "buttons-prompt-config": "# ROZSZERZENIE buttons.md dla Hotel NAZWA\n## Specyficzne przyciski...",
  "emailTo": ["hotel@example.com"]
}
```

🔧 **Krok po kroku**:
1. **Stwórz plik** `hotel-NAZWA-kv-config.json`
2. **Użyj MCP Google Sheets** do odczytania struktury arkusza (`spreadsheetId`)
3. **Wygeneruj `excel-config`** na podstawie struktury arkusza
4. **Dodaj specyficzne rozszerzenia** do pozostałych `*-prompt-config`

#### 2. Frontend Configuration  
```bash
cd ../hotel-chat-front/src/example/
```

**Stwórz**: `nazwa.json`
```json
{
  "id": "nazwa",
  "name": "Hotel Nazwa",
  "domain": "https://hotelnazwa.pl/",
  "setup": [{
    "utm": "default", 
    "config": {
      "webchat": {
        "logo": "URL_LOGA_HOTELU",
        "backgroundImage": "URL_TŁA",
        "cssClass": "/* Niestandardowe style CSS */",
        "appTitle": {"pl": "Hotel Nazwa - Asystent"}
        // ... reszta konfiguracji
      }
    }
  }]
}
```

### Modyfikacja Istniejącego Hotelu

#### Zmiana Wyglądu
**Plik**: `../hotel-chat-front/src/example/HOTEL.json`
- `webchat.logo` - Logo hotelu
- `webchat.backgroundImage` - Tło nagłówka
- `webchat.cssClass` - Style CSS
- `appTitle`, `appSubtitle` - Tytuły w różnych językach

#### Zmiana Zachowania AI

**🌍 Dla WSZYSTKICH hoteli**:
- **Plik**: `src/examples/general.md`
- **Sync**: Zmiany do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**🏨 Dla KONKRETNEGO hotelu**:
- **Plik**: `src/examples/hotel-NAZWA-kv-config.json` → `general-prompt-config`
- **Format**: Rozszerzenie głównego promptu

#### Zmiana Logiki Email

**🌍 Dla WSZYSTKICH hoteli**:
- **Plik**: `src/examples/email.md`
- **Sync**: Zmiany do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**🏨 Dla KONKRETNEGO hotelu**:
- **Plik**: `src/examples/hotel-NAZWA-kv-config.json` → `email-prompt-config`

#### Zmiana Przycisków

**🌍 Dla WSZYSTKICH hoteli**:
- **Plik**: `src/examples/buttons.md`
- **Sync**: Zmiany do [Langfuse Test](https://cloud.langfuse.com/project/cmcvrrg3x00qvad07fkq5x64g/prompts)

**🏨 Dla KONKRETNEGO hotelu**:
- **Plik**: `src/examples/hotel-NAZWA-kv-config.json` → `buttons-prompt-config`

#### Zmiana Arkuszy Google (Excel)

**Po zmianie `spreadsheetId`**:
1. **Użyj MCP Google Sheets** do odczytania struktury
2. **Wygeneruj nowy `excel-config`** 
3. **Zastąp** w `src/examples/hotel-NAZWA-kv-config.json`

---

## 🔍 Debugowanie

### Frontend Debug
```
http://localhost:3000?tenant=smile&debug=true
```

### Backend Logs
- Cloudflare Workers Dashboard → Logs
- Langfuse Dashboard → Traces

### Testowanie
```bash
# Backend (z tego katalogu)
npm run test

# Frontend  
cd ../hotel-chat-front
npm run dev
```

---

## 📋 Endpoints

### Konfiguracja (Test Environment)
- **Frontend Config**: `https://front-config-test.contact-56d.workers.dev`
- **Backend**: `https://hotel-agent-backend-test.contact-56d.workers.dev`

### Production
- **Frontend Config**: `https://front-config-prod.contact-56d.workers.dev`
- **Backend**: `https://hotel-agent-backend-prod.contact-56d.workers.dev`

---

## 🗄️ Struktura Bazy Danych

### Cloudflare KV Stores (Backend)
- **CHAT_SESSIONS** - Sesje rozmów
- **TENAT_CONFIG** - Konfiguracje hoteli  
- **TENAT_KNOWLEDGE_CACHE** - Cache danych z Google Sheets

### Google Sheets Integration
- Arkusze z danymi hotelowymi
- Automatyczne cache'owanie
- JWT authentication

---

## ⚠️ Ważne Zasady

1. **Zawsze używaj loggera** z systemu - nie dodawaj własnych logów
2. **Sprawdź strukturę bazy** - wykorzystuj istniejące encje
3. **Przygotuj plan** przed implementacją
4. **Nie używaj emotikonów** w logach
5. **Testuj na test environment** przed production

---

## 🚀 Deployment

### Backend (z tego katalogu)
```bash
npm run deploy  # Deploy do test/prod wg branch
```

### Frontend
```bash
cd ../hotel-chat-front
npm run build
npm run deploy  # Deploy do Cloudflare Pages
```

---

## 📞 Kontakt i Support

- **Logs**: Langfuse Dashboard
- **Errors**: Cloudflare Workers Dashboard  
- **Config Issues**: Sprawdź KV Stores
- **Frontend Issues**: Sprawdź Network tab w DevTools

## 🔧 Przydatne Komendy

```bash
# Uruchomienie frontend lokalnie z konkretnym tenantem
# (z katalogu ../hotel-chat-front)
http://localhost:3000?tenant=smile

# Test backendu
curl -X POST https://hotel-agent-backend-test.contact-56d.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","message":"Hello","tenantId":"smile"}'

# Sprawdzenie konfiguracji tenanta
curl https://front-config-test.contact-56d.workers.dev/smile
```

---

## 📋 Workflow Zmiany SpreadsheetId

### Krok po kroku:

1. **Zmień `spreadsheetId`** w `src/examples/hotel-NAZWA-kv-config.json`

2. **Użyj MCP Google Sheets** do odczytania struktury:
   ```
   Sprawdź arkusze, nagłówki, zawartość pierwszych wierszy
   ```

3. **Wygeneruj nowy `excel-config`**:
   - Przeanalizuj strukturę arkuszy
   - Stwórz mapowanie zapytań → arkusze
   - Dodaj przykłady użycia

4. **Zastąp `excel-config`** w pliku JSON

5. **Przetestuj** z przykładowymi zapytaniami

### 🎯 Przykład MCP Google Sheets Usage:

```
Spreadsheet ID: 1D2e5WCakqoupQy6lXWWBa6YS0-ThSQlIgh7Z0lS-2m8
- Sprawdź listę arkuszy
- Dla każdego arkusza: pobierz nagłówki (wiersz 1)
- Pobierz 3-5 przykładowych wierszy danych
- Wygeneruj opis zawartości i keywords
```