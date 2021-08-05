import fire from '../fire';
import firebase from 'firebase';

const firebaseConfig = fire;

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database()
const ref = database.ref('ring');

ref.onDisconnect().set(false)
// on disconnect 
 
export default async function (ringing) {

    const callingRef = database.ref('ring');

    if (ringing) {
        await callingRef.set(false)
    } else {
        await callingRef.set(true)
    }

    const result = await (await callingRef.get()).val();

    setTimeout(() => {// if no answer 15 sek
        callingRef.set(false)
    }, 15000);

    return result;
}