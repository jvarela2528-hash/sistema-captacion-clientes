const webhookUrl = "https://hook.us2.make.com/g4lwws1zrh77x7vt44nf49rwuogjjrux";

const testLead = {
  nombre: "Juan Del Pueblo",
  telefono: "+17875551234",
  pueblo: "San Juan",
  servicio: "Solar",
  factura: "$320.00",
  techo: "Concreto",
  credito: "750+",
  bateria: "Con Batería",
  calificacion: "🔥 Hot",
  clientId: "julio"
};

console.log("Enviando lead de prueba al webhook de Make...");

fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(testLead)
})
.then(response => {
  console.log(`Estado de respuesta: ${response.status} ${response.statusText}`);
  return response.text();
})
.then(text => {
  console.log("Respuesta del servidor:", text);
  console.log("¡Prueba completada con éxito!");
})
.catch(error => {
  console.error("Error al enviar el lead:", error);
});
