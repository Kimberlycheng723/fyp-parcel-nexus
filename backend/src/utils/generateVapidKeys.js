import webPush from "web-push";

const keys = webPush.generateVAPIDKeys();

console.log("Add these values to your local .env file. Do not commit the private key.");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
