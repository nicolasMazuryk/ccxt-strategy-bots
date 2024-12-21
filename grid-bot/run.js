const { getGridLevels } = require('./grid');

const gridLevels = getGridLevels();




console.log(gridLevels);


// Create a script using the ccxt library to build a LONG grid bot for the Binance exchange. The bot should perform the following tasks:

// •	Use a variable called gridLevels to define the number of grid levels.
// •	Place limit buy orders at the predefined grid levels.
// •	Continuously monitor the orders to check if they have been filled using websocket
// •	When a limit buy order is executed:
// 	•	Automatically place a corresponding limit sell order at a one level above. Ensure the sell order is for the same quantity.
// •	when a sell order is filled, reinitialize the grid by placing a new buy order at the original grid level one level below.