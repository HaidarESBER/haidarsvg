# Fix Module Resolution Issue

Si vous avez toujours l'erreur "Module not found: Error: Can't resolve 'haidar_app'", suivez ces étapes :

## Solution 1: Réinstaller les dépendances npm

1. **Supprimez node_modules et package-lock.json :**
   ```bash
   cd HaidarApp/app/www
   rmdir /s /q node_modules
   del package-lock.json
   ```

2. **Réinstallez :**
   ```bash
   npm install
   ```

3. **Redémarrez le serveur :**
   ```bash
   npm start
   ```

## Solution 2: Vérifier que le package WASM est construit

Assurez-vous que le dossier `pkg` existe et contient les fichiers :
- `haidar_app.js`
- `haidar_app_bg.wasm`
- `haidar_app.d.ts`
- `package.json`

Si le dossier `pkg` n'existe pas ou est vide :

```bash
cd HaidarApp/app
wasm-pack build --target web --out-dir www/pkg
```

## Solution 3: Utiliser un chemin relatif direct

Si les solutions ci-dessus ne fonctionnent pas, modifiez `index.js` :

Changez la première ligne de :
```javascript
import { BinaryImageConverter, ColorImageConverter } from 'haidar_app';
```

À :
```javascript
import { BinaryImageConverter, ColorImageConverter } from './pkg/haidar_app.js';
```

Puis redémarrez le serveur.

## Vérification

Pour vérifier que tout est correct :

1. Le dossier `HaidarApp/app/www/pkg/` doit exister
2. Le fichier `HaidarApp/app/www/pkg/package.json` doit contenir `"name": "haidar_app"`
3. Le fichier `HaidarApp/app/www/package.json` doit contenir `"haidar_app": "file:./pkg"`


