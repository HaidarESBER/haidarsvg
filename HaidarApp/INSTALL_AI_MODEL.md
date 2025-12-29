# Installation de l'AI Model pour Background Removal

L'application utilise maintenant **DeepLab** (similaire à rembg) pour une suppression de fond de qualité professionnelle.

## Installation des dépendances

Vous devez installer les packages TensorFlow.js :

```bash
cd HaidarApp/app/www
npm install @tensorflow/tfjs @tensorflow-models/deeplab
```

## Comment ça fonctionne

1. **Premier chargement** : Le modèle AI (~5-10MB) sera téléchargé automatiquement
2. **Cache** : Après le premier téléchargement, le modèle est mis en cache localement
3. **Utilisation** : Le modèle analyse l'image et identifie automatiquement le fond vs l'objet

## Avantages par rapport à l'ancienne méthode

✅ **Précision** : Utilise l'IA pour identifier le fond (comme rembg)  
✅ **Intelligent** : Fonctionne même avec des fonds complexes  
✅ **Bords nets** : Meilleure détection des contours  
✅ **Pas de configuration** : Fonctionne automatiquement  

## Note

- **Première utilisation** : Nécessite une connexion internet pour télécharger le modèle
- **Utilisations suivantes** : Fonctionne hors ligne (modèle en cache)
- **Performance** : Le traitement prend quelques secondes selon la taille de l'image


