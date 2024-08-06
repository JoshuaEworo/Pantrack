"use client";

import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';

interface ClientComponentProps {
    user: User; // Define the type for the user prop
}

// import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } = require("@google/generative-ai");
  

interface Item {
    id: number;
    name: string;
    description: string;
    quantity: number;
    tags: string[];
    user_id: string;
}

export default function Client({ user }: ClientComponentProps) {
    const supabase = createClient()

    const model = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY).getGenerativeModel({
        model: "gemini-1.5-flash",
    });
    
    async function generateRecipe() {
        const itemsConcat = items.map(item => 
            `{ id: ${item.id}, name: '${item.name}', description: '${item.description}', quantity: ${item.quantity}, tags: ${JSON.stringify(item.tags)} }`
          ).join(',\n');         

        const chatSession = model.startChat({
            generationConfig: {
                temperature: 1,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
            },
        });

        const result = await chatSession.sendMessage(`Given a list of pantry items, generate a recipe that uses those items in this format(json): Name, Description, ingredients, detailed instructions.\n{\n  \"name\": \"String\", // Name of the recipe\n  \"description\": \"String\", // Brief description of the recipe\n  \"ingredients\": [\n    {\n      \"id\": \"Number\", // ID of the ingredient from the pantry list\n      \"name\": \"String\", // Name of the ingredient\n      \"quantity\": \"Number\", // Quantity of the ingredient\n      \"unit\": \"String\" // Unit of measurement (e.g., cup, tablespoon, can)\n    }\n  ],\n  \"instructions\": [\n    \"String\" // Each step of the recipe as a string\n  ]\n}\n\nItems:\n${itemsConcat}`);
        const recipeData = JSON.parse(result.response.text());
        console.log(recipeData)
    
        try {            
            const { data, error } = await supabase
                .from('recipes')
                .insert([
                    {
                        user_id: user.id,
                        name: recipeData.name,
                        description: recipeData.description,
                        ingredients: recipeData.ingredients,
                        instructions: recipeData.instructions
                    }
                ]);

            if (error) {
                console.error('Error saving recipes:', error);
            } else {
                setRecipes(prevRecipes => [...prevRecipes, ...(data || [])]);
            }
        } catch (error) {
            console.error('Error parsing recipe data:', error);
        }
    }

    type Recipe = {
        id: string;
        name: string;
        description: string;
        ingredients: {
          id: string;
          name: string;
          quantity: number;
          unit: string;
        }[];
        instructions: string[];
      };
      

    const [items, setItems] = useState<Item[]>([]);
    const [search, setSearch] = useState('');
    const [showEmpty, setShowEmpty] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showRecipes, setShowRecipes] = useState(false);

    const [newItem, setNewItem] = useState({
        name: '',
        description: '',
        quantity: 1,
        tags: ''
    });
    const [recipes, setRecipes] = useState<Recipe[]>([]);

    useEffect(() => {
        fetchItems();
        fetchRecipes();

        const channel = supabase.channel('custom-all-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pantry' },
                (payload) => {
                    console.log('Change received!', payload);
    
                    // Ensure payload is of type Item
                    const newItem = payload.new as Item;
                    const oldItem = payload.old as Item;
    
                    // Handle different types of changes
                    switch (payload.eventType) {
                        case 'INSERT':
                            setItems(prevItems => [...prevItems, newItem]);
                            break;
                        case 'UPDATE':
                            setItems(prevItems =>
                                prevItems.map(item =>
                                    item.id === newItem.id ? newItem : item
                                )
                            );
                            break;
                        case 'DELETE':
                            setItems(prevItems => prevItems.filter(item => item.id !== oldItem.id));
                            break;
                        default:
                            break;
                    }
                }
            )
            .subscribe();
    
        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    useEffect(() => {
        const recipeChannel = supabase.channel('custom-recipe-channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'recipes' },
                (payload) => {
                    console.log('Recipe change received!', payload);
    
                    const newRecipe = payload.new as any; // Adjust type if needed
                    const oldRecipe = payload.old as any; // Adjust type if needed
    
                    switch (payload.eventType) {
                        case 'INSERT':
                            setRecipes(prevRecipes => [...prevRecipes, newRecipe]);
                            break;
                        case 'UPDATE':
                            setRecipes(prevRecipes =>
                                prevRecipes.map(recipe =>
                                    recipe.id === newRecipe.id ? newRecipe : recipe
                                )
                            );
                            break;
                        case 'DELETE':
                            setRecipes(prevRecipes => prevRecipes.filter(recipe => recipe.id !== oldRecipe.id));
                            break;
                        default:
                            break;
                    }
                }
            )
            .subscribe();
    
        return () => {
            supabase.removeChannel(recipeChannel);
        };
    }, [supabase]);
    

    useEffect(() => {
        // Ensure showEmpty is updated based on the current state of items
        if (!items || items.length === 0) {
            setShowEmpty(true);
        } else {
            setShowEmpty(false);
        }
    }, [items]);
    
    async function fetchItems() {
        let { data: items, error } = await supabase
            .from('pantry')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching items:', error);
        } else {
            setItems(items || []);
            setShowEmpty(false)
        }

        if (!items || items.length === 0) {
            setShowEmpty(true)
        }
    }

    async function fetchRecipes() {
        let { data: items, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching items:', error);
        } else {
            setRecipes(items || []);
        }
    }

    async function deleteRecipe(recipeId: string) {
        const { error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId);
    
        if (error) {
            console.error('Error deleting recipe:', error);
        } else {
            setRecipes(prevRecipes => prevRecipes.filter(recipe => recipe.id !== recipeId));
        }
    }
    

    async function addNew() {
        const tagsArray = newItem.tags.split(',').map(tag => tag.trim());

        const { data, error } = await supabase
            .from('pantry')
            .insert([
                {
                    user_id: user.id,
                    name: newItem.name,
                    description: newItem.description,
                    quantity: newItem.quantity,
                    tags: tagsArray
                }
            ]);

        if (error) {
            console.error('Error adding new item:', error);
        } else {
            setItems(prevItems => [...prevItems, ...(data || [])]); 
            setNewItem({ name: '', description: '', quantity: 1, tags: '' });
            setShowAddForm(false);
        }
    }

    async function incrementQuantity(itemId: number) {
        const item = items.find(item => item.id === itemId);
        if (!item) return;

        const { data, error } = await supabase
            .from('pantry')
            .update({ quantity: item.quantity + 1 })
            .eq('id', itemId);

        if (error) {
            console.error('Error incrementing quantity:', error);
        } else {
            setItems(prevItems =>
                prevItems.map(item =>
                    item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item
                )
            );
        }
    }

    async function decrementQuantity(itemId: number) {
        const item = items.find(item => item.id === itemId);
        if (!item || item.quantity <= 0) return;

        const { data, error } = await supabase
            .from('pantry')
            .update({ quantity: item.quantity - 1 })
            .eq('id', itemId);

        if (error) {
            console.error('Error decrementing quantity:', error);
        } else {
            setItems(prevItems =>
                prevItems.map(item =>
                    item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item
                )
            );
        }
    }

    async function deleteItem(itemId: number) {
        const { error } = await supabase
            .from('pantry')
            .delete()
            .eq('id', itemId);

        if (error) {
            console.error('Error deleting item:', error);
        } else {
            setItems(prevItems => prevItems.filter(item => item.id !== itemId));
        }
    }

    function toggleRecipes() {
        setShowRecipes(!showRecipes);
        setShowAddForm(false);
    }

    function toggleAddForm() {
        setShowAddForm(!showAddForm);
        setShowRecipes(false);
    }

    const allTags = Array.from(new Set(items.flatMap(item => item.tags)));
    // console.log(allTags);

    const filteredItems = search === '' ? items : items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        item.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <main className="flex flex-col w-full p-3 sm:p-6 bg-black text-white rounded-none sm:rounded-2xl">

            {/* The Navigation Bar */}
            <div className="flex w-full justify-between flex-col sm:flex-row">
                <div className="flex gap-2 item-center sm:items-end justify-center sm:justify-start">
                    <span className="logo-closet w-8 h-8"></span>
                    <h1 className="text-xl sm:text-3xl applefont">Pantrack</h1>
                </div>
                <div className="flex gap-6 items-center mt-5 sm:mt-0">
                    <div className="flex items-center">
                        <span className="logo-magnify w-6 h-6 mr-1"></span>
                        <input
                            className="outline-none bg-transparent border-b border-white text-sm sm:text-base"
                            type="text"
                            placeholder="Enter Item Here..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button className="rounded-lg border border-white w-24 h-12 hover:bg-neutral-700 ml-0 text-base hidden sm:inline-block" onClick={toggleRecipes}>{ showRecipes ? "Pantry" : "Recipes" }</button>
                    <button className="logo-reciper w-6 h-6 ml-auto sm:hidden" onClick={toggleRecipes}>{ showRecipes ? "Pantry" : "Recipes" }</button>
                    <button className={`logo-add w-6 h-6 sm:w-8 sm:h-8 ${showAddForm ? 'rotate-45' : ''}`} title="Add New Item" onClick={toggleAddForm}></button>
                </div>
            </div>

            {/* Add Item Form */}
            {showAddForm && (
                <div className="mt-28 border-none sm:border border-white p-6 rounded-lg w-11/12 sm:w-7/12 mx-auto">
                    <h2 className="text-2xl font-semibold mb-4">Add New Item</h2>
                    <form className="flex flex-col gap-4">
                        <input
                            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
                            type="text"
                            placeholder="Name"
                            value={newItem.name}
                            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        />
                        <input
                            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
                            type="text"
                            placeholder="Description"
                            value={newItem.description}
                            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        />
                        <input
                            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
                            type="number"
                            placeholder="Quantity"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) })}
                        />
                        <input
                            className="p-2 rounded bg-gray-700 border border-gray-600 text-white"
                            type="text"
                            placeholder="Tags (comma separated)"
                            value={newItem.tags}
                            onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
                        />
                        <div className="flex gap-3 flex-col sm:flex-row mt-5 sm:mt-0">
                            <button type="button" className="p-2 bg-violet-700 hover:bg-violet-800 rounded text-white  w-full sm:w-1/2" onClick={addNew}>Add Item</button>
                            <button type="button" className="p-2 border border-white rounded text-white hover:bg-neutral-500 w-full sm:w-1/2" onClick={() => setShowAddForm(!showAddForm)}>Close</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Recipes Display */}
            {showRecipes && (
                <div className="mt-10 overflow-y-auto h-full px-3 items">
                    <div className="flex justify-between items-center mb-4 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-semibold">Recipes</h2>
                        <button className='rounded-lg border border-white px-4 py-2 hover:bg-neutral-700 flex items-center' onClick={generateRecipe}>
                            <span className='logo-stars w-6 h-6 mr-3 text-xs sm:text-base'></span>
                            Generate New Recipes
                        </button>
                    </div>

                    <div className="flex gap-4 flex-col-reverse">
                        {recipes.map(recipe => (
                            <div key={recipe.id} className="border border-gray-600 p-4 rounded relative">
                                <button
                                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xl"
                                    onClick={() => deleteRecipe(recipe.id)}
                                >
                                    ✖
                                </button>
                                <h3 className="text-lg sm:text-xl font-semibold w-11/12 sm:w-full">{recipe.name}</h3>
                                <p className="mb-2 text-sm sm:text-base">{recipe.description}</p>
                                <h4 className="font-semibold text-sm sm:text-base">Ingredients:</h4>
                                <ul className="list-disc list-inside ml-4 mb-2">
                                    {recipe.ingredients.map((ingredient, index) => (
                                        <li className="text-sm sm:text-base" key={ingredient.id}>{ingredient.name}</li>
                                    ))}
                                </ul>
                                <h4 className="font-semibold">Instructions:</h4>
                                <ul className="list-disc list-inside ml-4">
                                    {recipe.instructions.map((instruction, index) => (
                                        <li key={index}>{instruction}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                </div>
            )}

            {/* The Items Display */}
            {!showAddForm && !showRecipes && showEmpty && (
                <div className="mt-10 overflow-y-auto flex flex-col items-center h-full justify-center gap-6">
                    <h1 className="text-4xl font-semibold ">Welcome to Pantrack!</h1>
                    <span className='text-neutral-400'>Your Pantry is currently empty right now</span>
                    <button type="button" className="p-2 text- bg-violet-700 hover:bg-violet-800 rounded text-white w-1/4 mb-8 text-lg" onClick={toggleAddForm}>Add Item</button>
                </div>
            )}

            {/* The Items Display */}
            {!showAddForm && !showRecipes && !showEmpty && (
                <div className="mt-10 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items">
                    
                    {filteredItems &&filteredItems.map(item => (
                        <div key={item.id} className="border border-white rounded-lg p-5 h-35 mx-2 sm:mx-3 flex flex-col justify-between">
                            <div className="flex flex-col">
                                <h2 className="font-semibold text-base sm:text-lg">{item.name}</h2>
                                <span className="text-xs sm:text-sm text-neutral-400">Quantity: {item.quantity}</span>
                                <p className='text-sm sm:text-base'>{item.description}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {item.tags.map((tag, index) => (
                                        <span key={index} className="bg-gray-700 text-white rounded-full px-2 py-1 text-xs">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className='flex flex-row justify-start items-center gap-5 mt-2 sm:mt-4'>
                                <button className='w-6 h-6 sm:w-8 sm:h-8 rounded-md text-lg sm:text-2xl' onClick={() => incrementQuantity(item.id)}>+</button>
                                <button className='w-6 h-6 sm:w-8 sm:h-8 rounded-md text-lg sm:text-2xl' onClick={() => decrementQuantity(item.id)}>-</button>
                                <div className='w-6 h-6 sm:w-8 sm:h-8 rounded-md flex justify-center items-center ml-auto'>
                                    <button className="logo-trash w-5 h-5 bg-neutral-800" onClick={() => deleteItem(item.id)}></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

        </main>
    );
}
