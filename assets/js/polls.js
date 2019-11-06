import Modal from "./modals"
import "phoenix_html"

class Polls {
    constructor() {
        this.channel = null
        this.is_mod = false
        this.myid = -1
        this.username = ""
        this.polls = {}
        
        btn_create_poll.addEventListener("click", () => {
            create_poll_modal(this.channel)
        })
    }

    connect(socket) {
        console.log("polls: connecting to room " + socket.room)
        this.channel = socket.channel("polls:" + socket.room, {password: socket.password})

        this.channel.on("controls", data => {
            console.log("polls: controls", data)
            this.is_mod = true
            btn_create_poll.classList.toggle("hidden", false)
            for (const poll_id in this.polls) {
                this.polls[poll_id].btn_delete.classList.toggle("hidden", false)
            }
        })

        this.channel.on("id", data => {
            console.log("polls: id", data)
            this.myid = data.id
        })

        this.channel.on("username", data => {
            console.log("polls: username", data)
            this.username = data.username
        })

        this.channel.on("polls", data => this.on_get_polls(data))

        return this.channel.join()
        .receive("ok", resp => {
            console.log("polls: connected", resp) 
        })
        .receive("error", resp => {
            console.log("polls: failed to connect", resp)
        })
    }

    on_get_polls(data) {
        console.log("polls: polls", data)
        while (polls_list.firstChild) polls_list.removeChild(polls_list.firstChild)
        for (const poll in this.polls) delete this.polls[poll]
    
        for (const poll in data) this.polls[poll] = data[poll]
    
        for (const poll_id in this.polls) {
            const poll = this.polls[poll_id]
    
            poll.e = document.createElement("div")
            poll.e.className = "poll_item"
    
            const inner = document.createElement("div")
            inner.className = "poll_item-inner"
            poll.e.appendChild(inner)
            
            const header = document.createElement("div")
            header.className = "poll_item-header"
            inner.appendChild(header)
    
            poll.btn_delete = document.createElement("button")
            poll.btn_delete.className = "square poll_item-delete"
            poll.btn_delete.classList.toggle("hidden", !this.is_mod)
            poll.btn_delete.textContent = "×"
            header.appendChild(poll.btn_delete)
    
            poll.btn_delete.addEventListener("click", () => {
                this.channel.push("poll_remove", {id: poll_id})
            })
            
            const poll_title = document.createElement("span")
            poll_title.className = "poll_item-title"
            poll_title.textContent = poll.title
            header.appendChild(poll_title)
    
            const poll_body = document.createElement("div")
            poll_body.className = "poll_item-body"
            inner.appendChild(poll_body)
    
            polls_list.insertBefore(poll.e, polls_list.firstChild)
            
            poll.choices.forEach(choice => {
                const poll_choice = document.createElement("div")
                poll_choice.className = "poll_choice"
    
                const poll_choose = document.createElement("button")
                poll_choose.className = "square"
                poll_choose.textContent = choice.users.length + choice.guests.length
                poll_choose.disabled = choice.users.includes(this.username) || choice.guests.includes(this.myid)
                poll_choose.addEventListener("click", () => {
                    this.channel.push("poll_vote", {id: poll_id, choice: choice.name})
                })
    
                poll_choice.appendChild(poll_choose)
    
                const choice_name = document.createElement("span")
                choice_name.textContent = choice.name
                poll_choice.appendChild(choice_name)
                poll_body.appendChild(poll_choice)
            })
    
            poll_body.lastChild.style.marginBottom = 0
        }
    }
}

function create_choice(choices, choices_list) {
    const choice = {}

    choice.e = document.createElement("div")
    choice.e.style.marginTop = "0.5em"
    choice.e.style.display = "block"

    choice.name = document.createElement("input")
    choice.name.placeholder = "name of choice"
    choice.name.style.marginRight = "0.5em"
    choice.e.appendChild(choice.name)

    choice.del = document.createElement("button")
    choice.del.textContent = "×"
    choice.del.style.verticalAlign = "middle"
    choice.del.classList.add("square")

    choice.del.addEventListener("click", () => {
        choices.forEach(c => {
            if (c.del == choice.del) {
                choices_list.removeChild(choice.e)
                choices.splice(choices.indexOf(c), 1)
            }
        })
    })

    choice.e.appendChild(choice.del)

    choices.push(choice)
    choices_list.appendChild(choice.e)
    return choice
}

function create_poll_modal(channel) {
    const modal = new Modal({title: "create a poll"})
    const modal_body = modal.get_body()

    const poll_title = document.createElement("input")
    poll_title.placeholder = "title"
    modal_body.appendChild(poll_title)

    const choices_list = document.createElement("div")
    choices_list.style.marginTop = "0.5em"
    modal_body.appendChild(choices_list)
    
    const choices = []
    create_choice(choices, choices_list)

    const poll_add_choice = document.createElement("button")
    poll_add_choice.textContent = "add another choice"
    poll_add_choice.style.marginTop = "0.5em"
    poll_add_choice.style.marginRight = "0.5em"

    poll_add_choice.addEventListener("click", () => {
        create_choice(choices, choices_list).name.focus()
    })

    modal_body.appendChild(poll_add_choice)

    const poll_create = document.createElement("button")
    poll_create.textContent = "create"
    poll_create.style.float = "right"
    poll_create.style.marginTop = "0.5em"

    poll_create.addEventListener("click", () => {
        const final_title = poll_title.value.trim()
        if (final_title.length <= 0) return
        if (choices.length <= 0) return

        const final_choices = []
        choices.forEach(e => {
            const choice = e.name.value.trim()
            if (choice.length > 0) {
                final_choices.push(choice)
            }
        })

        if (final_choices.length <= 0) return

        channel.push("poll_add", {title: final_title, choices: final_choices})

        modal.close()
    })
    
    modal_body.appendChild(poll_create)

    modal.show()
    poll_title.focus()
}

export default Polls
