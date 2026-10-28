# Impostazioni in IndexedDB, non in LocalStorage

Le impostazioni (nome, località meteo, schede visibili, data dell'ultimo backup) stanno in IndexedDB insieme agli altri dati strutturati. Il motivo è che l'importazione di un backup dati deve essere tutto-o-niente: con impostazioni in LocalStorage e dati in IndexedDB non esisterebbe un'unica transazione capace di sostituirli entrambi o di non toccare nulla. LocalStorage contiene solo la copia dell'ultima risposta meteo, un dato usa e getta che può andare perso senza danni.
