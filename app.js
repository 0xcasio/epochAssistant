// app.js - Main application file

const ethers = require('ethers');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  arbiscanApiKey: process.env.ARBISCAN_API_KEY || '',  // Optional, for higher rate limits
  contractAbi: [],  // Will be fetched automatically
  selectedFunction: null,  // Will be set by user selection
  outputFilePath: process.env.OUTPUT_FILE_PATH || './results.csv'
};

// Main function to call the contract
async function callContractFunction(inputValues) {
  try {
    console.log(`\nCalling contract function ${config.selectedFunction.name}...`);
    console.log('Inputs:', inputValues);
    console.log('Please wait...');
    
    // Set up provider and contract
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      provider
    );
    
    // Call the function with spread operator for all inputs
    const result = await contract[config.selectedFunction.name](...inputValues);
    
    // Format the result
    let formattedResult;
    if (Array.isArray(result)) {
      formattedResult = result.map(r => r.toString()).join(', ');
    } else {
      formattedResult = result.toString();
    }
    
    console.log(`\n✅ Success! Result: ${formattedResult}`);
    
    // Save result to CSV
    saveToFile(inputValues, formattedResult);
    
    // Ask if user wants to make another call
    rl.question('\nDo you want to make another call? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        rl.question('Call the same function again? (y/n): ', (sameFunc) => {
          if (sameFunc.toLowerCase() === 'y' || sameFunc.toLowerCase() === 'yes') {
            promptForInputs();
          } else {
            promptFunctionSelection();
          }
        });
      } else {
        console.log('\nThank you for using the Contract Function Caller. Goodbye!');
        rl.close();
      }
    });
    
    return formattedResult;
  } catch (error) {
    console.error('\n❌ Error calling contract:', error.message);
    
    // Ask if user wants to try again
    rl.question('\nDo you want to try again? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        promptForInputs();
      } else {
        promptFunctionSelection();
      }
    });
    
    return null;
  }
}

// Function to save results to a file
function saveToFile(inputs, result) {
  const timestamp = new Date().toISOString();
  
  // Create headers if file doesn't exist
  if (!fs.existsSync(config.outputFilePath)) {
    // Create headers based on the selected function
    const inputHeaders = config.selectedFunction.inputs
      .map((input, index) => input.name || `Input${index+1}`)
      .join(',');
    const headers = `Timestamp,Function,${inputHeaders},Result\n`;
    fs.writeFileSync(config.outputFilePath, headers);
  }
  
  // Format the CSV line
  const functionName = config.selectedFunction.name;
  const inputValues = inputs.join(',');
  const csvLine = `${timestamp},${functionName},${inputValues},${result}\n`;
  
  // Append data
  fs.appendFileSync(config.outputFilePath, csvLine);
  console.log(`📝 Result saved to ${config.outputFilePath}`);
}

// Function to prompt user for function selection
async function promptFunctionSelection() {
  console.log('\n--- Arbiscan Contract Function Caller ---');
  
  if (!config.contractAbi || config.contractAbi.length === 0) {
    console.log('\n⚠️ No ABI available. Fetching contract ABI...');
    await fetchContractAbi();
  }
  
  // Filter to only show read functions (view/pure)
  const readFunctions = config.contractAbi.filter(item => 
    item.type === 'function' && 
    (item.stateMutability === 'view' || item.stateMutability === 'pure')
  );
  
  if (readFunctions.length === 0) {
    console.log('❌ No readable functions found in this contract');
    rl.close();
    return;
  }
  
  console.log('\nAvailable read functions:');
  readFunctions.forEach((func, index) => {
    const inputs = func.inputs.map(input => `${input.type} ${input.name || ''}`).join(', ');
    const outputs = func.outputs.map(output => `${output.type}`).join(', ');
    console.log(`${index + 1}. ${func.name}(${inputs}) -> (${outputs})`);
  });
  
  rl.question('\nSelect a function by number: ', (selection) => {
    const index = parseInt(selection) - 1;
    
    if (isNaN(index) || index < 0 || index >= readFunctions.length) {
      console.log('❌ Invalid selection. Please try again.');
      promptFunctionSelection();
      return;
    }
    
    config.selectedFunction = readFunctions[index];
    console.log(`\n✅ Selected: ${config.selectedFunction.name}`);
    promptForInputs();
  });
}

// Function to prompt for function inputs
function promptForInputs() {
  if (!config.selectedFunction) {
    promptFunctionSelection();
    return;
  }
  
  const inputs = config.selectedFunction.inputs;
  if (inputs.length === 0) {
    // No inputs needed for this function
    callContractFunction([]);
    return;
  }
  
  const inputValues = [];
  
  function promptForInput(index) {
    if (index >= inputs.length) {
      // All inputs collected
      callContractFunction(inputValues);
      return;
    }
    
    const input = inputs[index];
    const typeHint = getTypeHint(input.type);
    
    rl.question(`Enter ${input.name || 'input ' + (index + 1)} (${input.type})${typeHint}: `, (value) => {
      // Validate input based on type
      if (!validateInput(value, input.type)) {
        console.log(`❌ Invalid input for type ${input.type}. Please try again.`);
        promptForInput(index);
        return;
      }
      
      // Format the input value based on its type
      const formattedValue = formatInput(value, input.type);
      inputValues.push(formattedValue);
      
      // Prompt for next input
      promptForInput(index + 1);
    });
  }
  
  // Start prompting for inputs
  promptForInput(0);
}

// Function to fetch contract ABI from Arbiscan
async function fetchContractAbi() {
  try {
    console.log('📡 Fetching contract ABI from Arbiscan...');
    
    // Arbiscan API URL
    const apiUrl = 'https://api.arbiscan.io/api';
    const apiParams = {
      module: 'contract',
      action: 'getabi',
      address: config.contractAddress,
      apikey: config.arbiscanApiKey || ''
    };
    
    // Format URL with parameters
    const queryString = Object.entries(apiParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const url = `${apiUrl}?${queryString}`;
    
    // Make API request
    const response = await axios.get(url);
    
    if (response.data.status === '1' && response.data.message === 'OK') {
      const abi = JSON.parse(response.data.result);
      config.contractAbi = abi;
      
      // Save ABI to file for future use
      fs.writeFileSync('contract-abi.json', JSON.stringify(abi, null, 2));
      console.log('✅ Contract ABI fetched successfully!');
      return true;
    } else {
      console.log(`❌ Failed to fetch ABI: ${response.data.message}`);
      
      // Ask if the user wants to provide ABI manually
      rl.question('\nWould you like to provide the contract ABI manually? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
          rl.question('\nEnter the file path to your ABI JSON file: ', (abiPath) => {
            try {
              const abiJson = fs.readFileSync(abiPath, 'utf8');
              config.contractAbi = JSON.parse(abiJson);
              fs.writeFileSync('contract-abi.json', abiJson);
              console.log('✅ ABI loaded successfully!');
              promptFunctionSelection();
            } catch (error) {
              console.error(`❌ Error loading ABI file: ${error.message}`);
              rl.close();
            }
          });
        } else {
          console.log('\nCannot proceed without ABI. Exiting.');
          rl.close();
        }
      });
      
      return false;
    }
  } catch (error) {
    console.error(`❌ Error fetching ABI: ${error.message}`);
    return false;
  }
}

// Input validation and formatting helpers
function validateInput(value, type) {
  if (!value && value !== '0') return false;
  
  // Basic validation based on type
  if (type.includes('int')) {
    return !isNaN(value) || value.startsWith('0x');
  } else if (type.includes('address')) {
    return ethers.utils.isAddress(value);
  } else if (type.includes('bool')) {
    return value === 'true' || value === 'false' || value === '1' || value === '0';
  }
  
  // For other types like strings, bytes, etc. just return true
  return true;
}

function formatInput(value, type) {
  // Format the input value based on its type
  if (type.includes('int')) {
    return value.startsWith('0x') ? value : ethers.BigNumber.from(value);
  } else if (type.includes('bool')) {
    return value === 'true' || value === '1';
  }
  
  // Return as is for other types
  return value;
}

function getTypeHint(type) {
  // Provide hints for common types
  if (type.includes('int')) {
    return ' (number)';
  } else if (type === 'address') {
    return ' (0x...)';
  } else if (type === 'bool') {
    return ' (true/false)';
  }
  return '';
}

// Check if the environment is configured
function checkConfig() {
  if (!config.contractAddress) {
    console.log('⚠️ CONTRACT_ADDRESS is not set in .env file');
    return false;
  }
  
  // Try to load ABI from file if exists
  try {
    if (fs.existsSync('contract-abi.json')) {
      const abiJson = fs.readFileSync('contract-abi.json', 'utf8');
      config.contractAbi = JSON.parse(abiJson);
      return true;
    }
  } catch (error) {
    console.log('⚠️ Error loading ABI file, will fetch from Arbiscan');
  }
  
  return config.contractAddress ? true : false;
}

// Setup function
async function setup() {
  console.clear();
  console.log('🔄 Checking configuration...');
  
  if (!checkConfig()) {
    rl.question('\nPlease enter the contract address: ', async (contractAddress) => {
      config.contractAddress = contractAddress.trim();
      
      // Save to .env file
      const envContent = `RPC_URL=${config.rpcUrl}\nCONTRACT_ADDRESS=${contractAddress}\nOUTPUT_FILE_PATH=${config.outputFilePath}`;
      fs.writeFileSync('.env', envContent);
      
      // Now fetch the ABI
      await fetchContractAbi();
      promptFunctionSelection();
    });
  } else {
    promptFunctionSelection();
  }
}

// Start the app
setup();